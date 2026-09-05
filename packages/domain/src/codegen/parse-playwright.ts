import { parse } from '@babel/parser';

import type { Locator } from '../locators/schema';
import type { Step } from '../steps/schema';
import { generatePlaywright } from './playwright';

type Node = { type: string; start?: number | null; end?: number | null; [key: string]: unknown };

export interface ParsedPlaywrightStep {
  step: Step;
  start: number;
  end: number;
}
export interface ParsedPlaywright {
  title: string;
  steps: ParsedPlaywrightStep[];
  error?: string;
}

const node = (value: unknown): Node | undefined =>
  value && typeof value === 'object' && 'type' in value ? (value as Node) : undefined;
const stringValue = (value: unknown): string | undefined => {
  const candidate = node(value);
  return candidate?.type === 'StringLiteral' ? (candidate.value as string) : undefined;
};
const member = (value: unknown): { object: Node; property: string } | undefined => {
  const candidate = node(value);
  if (candidate?.type !== 'MemberExpression' && candidate?.type !== 'OptionalMemberExpression')
    return;
  const object = node(candidate.object);
  const property = node(candidate.property);
  if (!object || property?.type !== 'Identifier') return;
  return { object, property: property.name as string };
};
const call = (value: unknown): { callee: Node; args: Node[] } | undefined => {
  const candidate = node(value);
  if (candidate?.type !== 'CallExpression' && candidate?.type !== 'OptionalCallExpression') return;
  const callee = node(candidate.callee);
  if (!callee) return;
  return { callee, args: (candidate.arguments as unknown[]).map(node).filter(Boolean) as Node[] };
};
const isIdentifier = (value: unknown, name: string): boolean => {
  const candidate = node(value);
  return candidate?.type === 'Identifier' && candidate.name === name;
};
const metadata = (_start: number): Step['metadata'] => ({
  recordedAt: new Date(0).toISOString(),
});

const locatorFrom = (value: unknown): Locator | undefined => {
  const invocation = call(value);
  const access = invocation && member(invocation.callee);
  if (!invocation || !access || !isIdentifier(access.object, 'page')) return;
  const first = stringValue(invocation.args[0]);
  if (first === undefined) return;
  switch (access.property) {
    case 'getByTestId':
      if (invocation.args.length !== 1) return;
      return { strategy: 'testId', attribute: 'data-testid', value: first };
    case 'getByLabel':
      if (invocation.args.length !== 1) return;
      return { strategy: 'label', text: first };
    case 'getByPlaceholder':
      if (invocation.args.length !== 1) return;
      return { strategy: 'placeholder', text: first };
    case 'getByText': {
      const options = invocation.args[1];
      const exact =
        options?.type === 'ObjectExpression' &&
        (options.properties as Node[]).some((property) => {
          const key = node(property.key);
          const value = node(property.value);
          return (
            key?.type === 'Identifier' &&
            key.name === 'exact' &&
            value?.type === 'BooleanLiteral' &&
            value.value === true
          );
        });
      if (invocation.args.length !== 2 || !exact) return;
      return { strategy: 'text', text: first };
    }
    case 'getByRole': {
      const options = invocation.args[1];
      if (
        invocation.args.length !== 2 ||
        options?.type !== 'ObjectExpression' ||
        (options.properties as Node[]).length !== 1
      )
        return;
      const property = (options.properties as Node[]).find((candidate) => {
        const key = node(candidate.key);
        return key?.type === 'Identifier' && key.name === 'name';
      });
      const name = stringValue(property?.value);
      return name === undefined ? undefined : { strategy: 'role', role: first, name };
    }
    case 'locator': {
      if (invocation.args.length !== 1) return;
      const attribute = first.match(/^\[([^=]+)=['"](.+)['"]\]$/);
      if (attribute?.[1] === 'id') return { strategy: 'id', value: attribute[2]! };
      if (attribute?.[1] === 'name') return { strategy: 'name', value: attribute[2]! };
      if (attribute) return { strategy: 'testId', attribute: attribute[1]!, value: attribute[2]! };
      return { strategy: 'css', selector: first, fragile: true };
    }
  }
};

const targetFrom = (value: unknown) => {
  const primary = locatorFrom(value);
  return primary ? { primary, alternatives: [] } : undefined;
};

const parseAction = (expression: Node, start: number): Step | undefined => {
  const invocation = expression.type === 'AwaitExpression' ? call(expression.argument) : undefined;
  const access = invocation && member(invocation.callee);
  if (!invocation || !access) return;
  if (
    isIdentifier(access.object, 'page') &&
    access.property === 'goto' &&
    invocation.args.length === 1
  ) {
    const url = stringValue(invocation.args[0]);
    if (url) return { version: 1, kind: 'navigate', url, metadata: metadata(start) };
  }
  const target = targetFrom(access.object);
  if (target) {
    if (
      invocation.args.length === 0 &&
      ['click', 'hover', 'check', 'uncheck'].includes(access.property)
    )
      return {
        version: 1,
        kind: access.property as 'click' | 'hover' | 'check' | 'uncheck',
        target,
        metadata: metadata(start),
      };
    if (access.property === 'fill' && invocation.args.length === 1) {
      const value = stringValue(invocation.args[0]);
      const required = call(invocation.args[0]);
      const variable =
        required && isIdentifier(required.callee, 'requiredEnv')
          ? stringValue(required.args[0])
          : undefined;
      if (value !== undefined || variable)
        return {
          version: 1,
          kind: 'fill',
          target,
          value: value ?? '',
          ...(variable ? { variable: { name: variable } } : {}),
          metadata: metadata(start),
        };
    }
    if (access.property === 'selectOption' && invocation.args.length === 1) {
      const value = stringValue(invocation.args[0]);
      if (value !== undefined)
        return { version: 1, kind: 'selectOption', target, value, metadata: metadata(start) };
    }
    if (access.property === 'press' && invocation.args.length === 1) {
      const key = stringValue(invocation.args[0]);
      if (key) return { version: 1, kind: 'press', target, key, metadata: metadata(start) };
    }
  }
  if (access.property === 'toHaveURL' && invocation.args.length === 1) {
    const expectedCall = call(access.object);
    const callback = invocation.args[0];
    const comparison =
      callback?.type === 'ArrowFunctionExpression' ? node(callback.body) : undefined;
    const expected =
      comparison?.type === 'BinaryExpression' ? stringValue(comparison.right) : undefined;
    if (
      expectedCall &&
      isIdentifier(expectedCall.callee, 'expect') &&
      isIdentifier(expectedCall.args[0], 'page') &&
      expected !== undefined
    )
      return { version: 1, kind: 'assertUrlPath', expected, metadata: metadata(start) };
  }
  if (access.property === 'toBeGreaterThanOrEqual' && invocation.args.length === 1) {
    const pollCall = call(access.object);
    const pollAccess = pollCall && member(pollCall.callee);
    const callback = pollCall?.args[0];
    const countCall =
      callback?.type === 'ArrowFunctionExpression' ? call(callback.body) : undefined;
    const countAccess = countCall && member(countCall.callee);
    const assertionTarget =
      countAccess?.property === 'count' ? targetFrom(countAccess.object) : undefined;
    const expected =
      invocation.args[0]?.type === 'NumericLiteral' ? Number(invocation.args[0].value) : undefined;
    if (
      pollAccess?.property === 'poll' &&
      isIdentifier(pollAccess.object, 'expect') &&
      assertionTarget &&
      expected !== undefined
    )
      return {
        version: 1,
        kind: 'assertElement',
        target: assertionTarget,
        assertion: { type: 'count', operator: 'atLeast', expected },
        metadata: metadata(start),
      };
  }
  const notAccess = member(access.object);
  const notExpectedCall = notAccess?.property === 'not' ? call(notAccess.object) : undefined;
  if (
    access.property === 'toBeChecked' &&
    invocation.args.length === 0 &&
    notExpectedCall &&
    isIdentifier(notExpectedCall.callee, 'expect')
  ) {
    const assertionTarget = targetFrom(notExpectedCall.args[0]);
    if (assertionTarget)
      return {
        version: 1,
        kind: 'assertElement',
        target: assertionTarget,
        assertion: { type: 'unchecked' },
        metadata: metadata(start),
      };
  }
  const expectedCall = call(access.object);
  if (!expectedCall || !isIdentifier(expectedCall.callee, 'expect')) return;
  const assertionTarget = targetFrom(expectedCall.args[0]);
  if (!assertionTarget) return;
  const simple = {
    toBeVisible: 'visible',
    toBeHidden: 'hidden',
    toBeEnabled: 'enabled',
    toBeDisabled: 'disabled',
    toBeChecked: 'checked',
  } as const;
  if (access.property in simple && invocation.args.length === 0)
    return {
      version: 1,
      kind: 'assertElement',
      target: assertionTarget,
      assertion: { type: simple[access.property as keyof typeof simple] },
      metadata: metadata(start),
    };
  const expected = stringValue(invocation.args[0]);
  const textMatchers = { toHaveText: 'equals', toContainText: 'contains' } as const;
  if (access.property in textMatchers && invocation.args.length === 1 && expected !== undefined)
    return {
      version: 1,
      kind: 'assertElement',
      target: assertionTarget,
      assertion: {
        type: 'text',
        match: textMatchers[access.property as keyof typeof textMatchers],
        expected,
      },
      metadata: metadata(start),
    };
  if (access.property === 'toHaveValue' && invocation.args.length === 1 && expected !== undefined)
    return {
      version: 1,
      kind: 'assertElement',
      target: assertionTarget,
      assertion: { type: 'value', expected },
      metadata: metadata(start),
    };
  if (access.property === 'toHaveClass' && invocation.args.length === 1 && expected !== undefined)
    return {
      version: 1,
      kind: 'assertElement',
      target: assertionTarget,
      assertion: { type: 'class', expected },
      metadata: metadata(start),
    };
  if (access.property === 'toHaveAttribute' && invocation.args.length === 2) {
    const name = stringValue(invocation.args[0]);
    const attributeExpected = stringValue(invocation.args[1]);
    if (name !== undefined && attributeExpected !== undefined)
      return {
        version: 1,
        kind: 'assertElement',
        target: assertionTarget,
        assertion: { type: 'attribute', name, expected: attributeExpected },
        metadata: metadata(start),
      };
  }
  const count =
    invocation.args[0]?.type === 'NumericLiteral' ? Number(invocation.args[0].value) : undefined;
  if (access.property === 'toHaveCount' && invocation.args.length === 1 && count !== undefined)
    return {
      version: 1,
      kind: 'assertElement',
      target: assertionTarget,
      assertion: { type: 'count', operator: 'equals', expected: count },
      metadata: metadata(start),
    };
};

export const parsePlaywright = (source: string): ParsedPlaywright => {
  try {
    const file = parse(source, { sourceType: 'module', plugins: ['typescript'], ranges: true });
    let title = 'Untitled test';
    let statements: Node[] = [];
    let foundTest = false;
    for (const statement of file.program.body as unknown as Node[]) {
      if (statement.type !== 'ExpressionStatement') continue;
      const invocation = call(statement.expression);
      if (!invocation || !isIdentifier(invocation.callee, 'test')) continue;
      foundTest = true;
      title = stringValue(invocation.args[0]) ?? title;
      const callback = invocation.args[1];
      const block =
        callback && ['ArrowFunctionExpression', 'FunctionExpression'].includes(callback.type)
          ? node(callback.body)
          : undefined;
      if (block?.type === 'BlockStatement') statements = block.body as Node[];
      break;
    }
    if (!foundTest)
      return { title, steps: [], error: 'No Playwright test() declaration was found.' };
    return {
      title,
      steps: statements.map((statement) => {
        const start = statement.start ?? 0;
        const end = statement.end ?? start;
        const expression =
          statement.type === 'ExpressionStatement' ? node(statement.expression) : undefined;
        const step = expression && parseAction(expression, start);
        return {
          start,
          end,
          step: step ?? {
            version: 1,
            kind: 'code',
            code: source.slice(start, end),
            reason: 'Testron cannot represent this statement as a structured step.',
            metadata: metadata(start),
          },
        };
      }),
    };
  } catch (error) {
    return {
      title: 'Untitled test',
      steps: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const generatedStatement = (step: Step, title: string): string => {
  if (step.kind === 'code') return step.code;
  return (
    generatePlaywright(title, [step])
      .split('\n')
      .find((line) => /^ {2}await /.test(line))
      ?.trim() ?? step.kind
  );
};

const semanticStepKey = (step: Step): string =>
  JSON.stringify(step, (key, value) =>
    ['metadata', 'alternatives', 'warnings'].includes(key) ? undefined : value,
  );

export const replacePlaywrightStepSource = (source: string, index: number, step: Step): string => {
  const parsed = parsePlaywright(source);
  const current = parsed.steps[index];
  if (parsed.error || !current) return source;
  return `${source.slice(0, current.start)}${generatedStatement(step, parsed.title)}${source.slice(current.end)}`;
};

export const deletePlaywrightStepSource = (source: string, index: number): string => {
  const parsed = parsePlaywright(source);
  const current = parsed.steps[index];
  if (parsed.error || !current) return source;
  return `${source.slice(0, current.start)}${source.slice(current.end)}`;
};

export const renamePlaywrightTestSource = (source: string, title: string): string => {
  try {
    const file = parse(source, { sourceType: 'module', plugins: ['typescript'], ranges: true });
    for (const statement of file.program.body as unknown as Node[]) {
      if (statement.type !== 'ExpressionStatement') continue;
      const invocation = call(statement.expression);
      if (!invocation || !isIdentifier(invocation.callee, 'test')) continue;
      const titleNode = invocation.args[0];
      if (titleNode?.type !== 'StringLiteral' || titleNode.start == null || titleNode.end == null)
        return source;
      return `${source.slice(0, titleNode.start)}${JSON.stringify(title)}${source.slice(titleNode.end)}`;
    }
  } catch {
    // Invalid drafts keep their exact source until they parse again.
  }
  return source;
};

/** Rewrites only the test body and keeps imports, helpers, and the surrounding test document. */
export const rewritePlaywrightSteps = (source: string, nextSteps: readonly Step[]): string => {
  const parsed = parsePlaywright(source);
  if (parsed.error) return source;
  if (parsed.steps.length === 0) {
    const closing = source.lastIndexOf('\n});');
    if (closing < 0 || nextSteps.length === 0) return source;
    const inserted = nextSteps
      .map((step) => `  ${generatedStatement(step, parsed.title).replaceAll('\n', '\n  ')}`)
      .join('\n');
    return `${source.slice(0, closing)}\n${inserted}${source.slice(closing)}`;
  }
  const first = parsed.steps[0]!;
  const last = parsed.steps.at(-1)!;
  const body = nextSteps
    .map((step, index) => {
      const previous = parsed.steps[index];
      const unchanged = previous && semanticStepKey(previous.step) === semanticStepKey(step);
      return unchanged
        ? source.slice(previous.start, previous.end)
        : generatedStatement(step, parsed.title);
    })
    .join('\n  ');
  return `${source.slice(0, first.start)}${body}${source.slice(last.end)}`;
};
