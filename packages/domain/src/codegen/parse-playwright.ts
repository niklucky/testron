import { numberMatchers } from '../steps/numbers';
import { parse } from '@babel/parser';

import type { Locator } from '../locators/schema';
import { redactStepSecrets, stepSchema, type Step } from '../steps/schema';
import { generatePlaywright, requiredEnvSource } from './playwright';

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
  bodyEnd?: number | undefined;
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
      const attribute = first.match(/^\[([\w:-]+)=(?:'([^'\\]*)'|"([^"\\]*)")\]$/);
      const attributeValue = attribute?.[2] ?? attribute?.[3];
      if (attribute?.[1] === 'id') return { strategy: 'id', value: attributeValue! };
      if (attribute?.[1] === 'name') return { strategy: 'name', value: attributeValue! };
      if (attribute)
        return { strategy: 'testId', attribute: attribute[1]!, value: attributeValue! };
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
  const numberOperator = (Object.keys(numberMatchers) as (keyof typeof numberMatchers)[]).find(
    (key) => numberMatchers[key] === access.property,
  );
  if (numberOperator && invocation.args.length === 1) {
    const poll = call(access.object);
    const pollAccess = poll && member(poll.callee);
    const callback = poll?.args[0];
    const block = callback?.type === 'ArrowFunctionExpression' ? node(callback.body) : undefined;
    const declaration =
      block?.type === 'BlockStatement' ? node((block.body as unknown[])[0]) : undefined;
    const variable =
      declaration?.type === 'VariableDeclaration'
        ? node((declaration.declarations as unknown[])[0])
        : undefined;
    const conversion = call(variable?.init);
    const logical = conversion?.args[0];
    const trim = logical?.type === 'LogicalExpression' ? call(logical.left) : undefined;
    const trimAccess = trim && member(trim.callee);
    const awaited = trimAccess?.object;
    const read = awaited?.type === 'AwaitExpression' ? call(awaited.argument) : undefined;
    const readAccess = read && member(read.callee);
    const target =
      readAccess?.property === 'textContent' ? targetFrom(readAccess.object) : undefined;
    const argument = invocation.args[0];
    const operand =
      argument?.type === 'UnaryExpression' && argument.operator === '-'
        ? node(argument.argument)
        : argument;
    const expected =
      operand?.type === 'NumericLiteral'
        ? Number(operand.value) * (operand === argument ? 1 : -1)
        : undefined;
    if (
      pollAccess?.property === 'poll' &&
      isIdentifier(pollAccess.object, 'expect') &&
      target &&
      expected !== undefined
    )
      return {
        version: 1,
        kind: 'assertElement',
        target,
        assertion: { type: 'number', operator: numberOperator, expected },
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

const syntaxKey = (value: unknown): string =>
  JSON.stringify(value, (key, entry) =>
    [
      'start',
      'end',
      'loc',
      'range',
      'extra',
      'leadingComments',
      'trailingComments',
      'innerComments',
    ].includes(key)
      ? undefined
      : entry,
  );
const statementExpression = (source: string): unknown => {
  const statement = parse(source, { sourceType: 'module', plugins: ['typescript'] }).program
    .body[0];
  return statement?.type === 'ExpressionStatement' ? statement.expression : undefined;
};

export const parsePlaywright = (source: string): ParsedPlaywright => {
  try {
    const file = parse(source, { sourceType: 'module', plugins: ['typescript'], ranges: true });
    let title = 'Untitled test';
    let statements: Node[] = [];
    let foundTest = false;
    let bodyEnd: number | undefined;
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
      if (block?.type !== 'BlockStatement')
        return {
          title,
          steps: [],
          error: 'A Playwright test callback with a block body is required.',
        };
      statements = block.body as Node[];
      bodyEnd = block.end! - 1;
      break;
    }
    if (!foundTest)
      return { title, steps: [], error: 'No Playwright test() declaration was found.' };
    return {
      title,
      bodyEnd,
      steps: statements.map((statement) => {
        const start = statement.start ?? 0;
        const end = statement.end ?? start;
        const expression =
          statement.type === 'ExpressionStatement' ? node(statement.expression) : undefined;
        const candidate = expression && parseAction(expression, start);
        // Only project syntax with exactly the same meaning as our generator.
        // Options, computed/optional calls, and custom predicates stay exact code.
        const validated = candidate && stepSchema.safeParse(candidate);
        const step =
          validated?.success &&
          expression &&
          syntaxKey(expression) ===
            syntaxKey(statementExpression(generatedStatement(validated.data, title)))
            ? validated.data
            : undefined;
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

export const generatedStatement = (step: Step, title: string): string => {
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
  return ensurePlaywrightDependencies(
    `${source.slice(0, current.start)}${generatedStatement(step, parsed.title)}${source.slice(current.end)}`,
    [step],
  );
};

/** Remove a standalone statement's line, while preserving adjacent code and comments. */
const removeStatement = (source: string, start: number, end: number): string => {
  const lineStart = source.lastIndexOf('\n', start - 1) + 1;
  const newline = source.indexOf('\n', end);
  const lineEnd = newline < 0 ? source.length : newline;
  if (!source.slice(lineStart, start).trim() && !source.slice(end, lineEnd).trim())
    return source.slice(0, lineStart) + source.slice(newline < 0 ? lineEnd : lineEnd + 1);
  return source.slice(0, start) + source.slice(end);
};

export const deletePlaywrightStepSource = (source: string, index: number): string => {
  const parsed = parsePlaywright(source);
  const current = parsed.steps[index];
  if (parsed.error || !current) return source;
  return removeStatement(source, current.start, current.end);
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
    const closing = parsed.bodyEnd;
    if (closing === undefined || nextSteps.length === 0) return source;
    const inserted = nextSteps
      .map((step) => `  ${generatedStatement(step, parsed.title).replaceAll('\n', '\n  ')}`)
      .join('\n');
    const prefix = source.slice(0, closing).replace(/[\t ]+$/, '');
    return ensurePlaywrightDependencies(
      `${prefix}${prefix.endsWith('\n') ? '' : '\n'}${inserted}\n${source.slice(closing)}`,
      nextSteps,
    );
  }
  let result = source;
  // Work backwards so earlier statement offsets remain valid after every edit.
  for (let index = parsed.steps.length - 1; index >= 0; index--) {
    const previous = parsed.steps[index]!;
    const step = nextSteps[index];
    if (!step) {
      result = removeStatement(result, previous.start, previous.end);
      continue;
    }
    let replacement =
      semanticStepKey(previous.step) === semanticStepKey(step)
        ? source.slice(previous.start, previous.end)
        : generatedStatement(step, parsed.title);
    if (index === parsed.steps.length - 1)
      replacement += nextSteps
        .slice(parsed.steps.length)
        .map((extra) => `\n  ${generatedStatement(extra, parsed.title).replaceAll('\n', '\n  ')}`)
        .join('');
    result = result.slice(0, previous.start) + replacement + result.slice(previous.end);
  }
  return ensurePlaywrightDependencies(result, nextSteps);
};

/** Add dependencies required by newly generated statements without replacing user code. */
export const ensurePlaywrightDependencies = (source: string, steps: readonly Step[]): string => {
  const file = parse(source, { sourceType: 'module', plugins: ['typescript'] });
  const needsExpect = steps.some(
    (step) =>
      step.kind.startsWith('assert') || (step.kind === 'code' && /\bexpect\s*\(/.test(step.code)),
  );
  const needsEnv = steps.some((step) => step.kind === 'fill' && (step.variable || step.secret));
  const hasExpect = file.program.body.some(
    (statement) =>
      statement.type === 'ImportDeclaration' &&
      statement.specifiers.some((specifier) => specifier.local.name === 'expect'),
  );
  const hasEnv = file.program.body.some(
    (statement) =>
      (statement.type === 'FunctionDeclaration' && statement.id?.name === 'requiredEnv') ||
      (statement.type === 'VariableDeclaration' &&
        statement.declarations.some(
          (declaration) =>
            declaration.id.type === 'Identifier' && declaration.id.name === 'requiredEnv',
        )),
  );
  let prefix = needsExpect && !hasExpect ? "import { expect } from '@playwright/test';\n" : '';
  if (needsEnv && !hasEnv) prefix += requiredEnvSource + '\n';
  return prefix + source;
};

export const appendPlaywrightStepSource = (source: string, step: Step): string => {
  const parsed = parsePlaywright(source);
  if (parsed.error || parsed.bodyEnd === undefined) return source;
  return rewritePlaywrightSteps(source, [...parsed.steps.map(({ step }) => step), step]);
};

/** Structured runners must never execute a stale or partial projection. */
export const playwrightReplayError = (
  source: string | undefined,
  throughIndex?: number,
): string | undefined => {
  if (source === undefined) return;
  const parsed = parsePlaywright(source);
  if (parsed.error) return `Fix the Playwright source before replaying steps: ${parsed.error}`;
  if (
    parsed.steps
      .slice(0, throughIndex === undefined ? undefined : throughIndex + 1)
      .some(({ step }) => step.kind === 'code')
  )
    return 'This test contains exact Playwright code. Complete-spec execution is not available yet.';
  const file = parse(source, { sourceType: 'module', plugins: ['typescript'] });
  const generated = parse(
    generatePlaywright(
      parsed.title,
      parsed.steps.map(({ step }) => step),
    ),
    { sourceType: 'module', plugins: ['typescript'] },
  );
  const helper = parse(requiredEnvSource, { sourceType: 'module', plugins: ['typescript'] }).program
    .body[0]!;
  let tests = 0;
  const imports = new Set<string>();
  for (const statement of file.program.body as unknown as Node[]) {
    if (
      statement.type === 'ImportDeclaration' &&
      stringValue(statement.source) === '@playwright/test'
    ) {
      if (statement.importKind === 'type')
        return 'Structured replay requires runtime Playwright imports.';
      for (const specifier of statement.specifiers as Node[]) {
        const imported = node(specifier.imported);
        const local = node(specifier.local);
        if (
          specifier.type !== 'ImportSpecifier' ||
          specifier.importKind === 'type' ||
          imported?.name !== local?.name ||
          !['test', 'expect'].includes(String(local?.name))
        )
          return 'Custom Playwright imports require complete-spec execution.';
        imports.add(String(local!.name));
      }
      continue;
    }
    if (helper && syntaxKey(statement) === syntaxKey(helper)) continue;
    const invocation = statement.type === 'ExpressionStatement' && call(statement.expression);
    if (invocation && isIdentifier(invocation.callee, 'test')) {
      tests++;
      const callback = invocation.args[1];
      const expectedTest = generated.program.body.at(-1) as unknown as Node;
      const expectedCallback = call(expectedTest.expression)!.args[1]!;
      if (
        invocation.args.length === 2 &&
        callback?.async === true &&
        syntaxKey(callback.params) === syntaxKey(expectedCallback.params)
      )
        continue;
    }
    return 'This document requires complete-spec execution because it contains additional setup, fixtures, or test declarations.';
  }
  if (tests !== 1) return 'Structured replay requires exactly one Playwright test.';
  if (
    !imports.has('test') ||
    (parsed.steps.some(({ step }) => step.kind.startsWith('assert')) && !imports.has('expect'))
  )
    return 'Import test and any required expect binding from @playwright/test before replaying.';
};

/** Reserve unchanged steps before matching edits by position, preserving recorder-only data. */
export const reconcilePlaywrightSteps = (
  previous: readonly Step[],
  parsed: readonly Step[],
): Step[] => {
  let nextTimestamp = Math.max(
    Date.now(),
    ...previous.map((step) => Date.parse(step.metadata.recordedAt) + 1),
  );
  const remaining = new Set(previous.map((_, index) => index));
  const keys = previous.map((step) => generatedStatement(step, ''));
  const chosen = parsed.map((step) => {
    const key = generatedStatement(step, '');
    const match = keys.findIndex((candidate, index) => remaining.has(index) && candidate === key);
    if (match >= 0) remaining.delete(match);
    return match;
  });
  return parsed.map((step, index) => {
    const match = chosen[index]! >= 0 ? chosen[index]! : remaining.has(index) ? index : -1;
    if (match >= 0) remaining.delete(match);
    const before = previous[match];
    if (!before || before.kind !== step.kind)
      return redactStepSecrets({
        ...step,
        metadata: { recordedAt: new Date(nextTimestamp++).toISOString() },
      });
    const target =
      'target' in before &&
      'target' in step &&
      JSON.stringify(before.target.primary) === JSON.stringify(step.target.primary)
        ? before.target
        : undefined;
    return redactStepSecrets({
      ...step,
      metadata: before.metadata,
      ...(target ? { target } : {}),
      ...(step.kind === 'fill' &&
      before.kind === 'fill' &&
      before.secret &&
      step.variable?.name === before.secret.environmentVariable
        ? { secret: before.secret, variable: undefined }
        : {}),
    });
  });
};
