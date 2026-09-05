import { elementAssertionSchema, type ElementAssertion } from '@testron/domain/steps/schema';
import { isNumberComparison, numberComparisons } from '@testron/domain/steps/numbers';
import type { VerifyAssertion } from '../../preload/verify-assertion';
import type { Step } from '@testron/domain/steps/schema';

/** Replace a mistakenly recorded action with the assertion it most likely meant. */
export const convertStepToAssertion = (step: Step, currentUrl: string): Step => {
  if (step.kind === 'assertElement' || step.kind === 'assertUrlPath' || step.kind === 'code')
    return step;

  if (step.kind === 'navigate') {
    let expected = '/';
    try {
      expected = new URL(step.url || currentUrl).pathname;
    } catch {
      // The schema already guarantees a URL; keep a safe path if an edited step is malformed.
    }
    return { version: 1, kind: 'assertUrlPath', expected, metadata: step.metadata };
  }

  const assertion = (() => {
    switch (step.kind) {
      case 'fill':
        return step.secret
          ? ({ type: 'visible' } as const)
          : ({ type: 'value', expected: step.value } as const);
      case 'selectOption':
        return { type: 'value', expected: step.value } as const;
      case 'check':
        return { type: 'checked' } as const;
      case 'uncheck':
        return { type: 'unchecked' } as const;
      case 'click':
      case 'hover':
      case 'press':
        return { type: 'visible' } as const;
    }
  })();

  return {
    version: 1,
    kind: 'assertElement',
    target: structuredClone(step.target),
    assertion,
    metadata: step.metadata,
  };
};

export type AssertionPatch = {
  attributeName?: string;
  expected: string;
  assertion?: VerifyAssertion;
};
export const editElementAssertion = (
  current: ElementAssertion,
  patch: AssertionPatch,
): ElementAssertion | undefined => {
  let next: unknown;
  if (current.type === 'text') {
    if (patch.assertion && !['textEquals', 'textContains'].includes(patch.assertion)) return;
    next = {
      ...current,
      match: patch.assertion
        ? patch.assertion === 'textEquals'
          ? 'equals'
          : 'contains'
        : current.match,
      expected: patch.expected,
    };
  } else if (current.type === 'number') {
    if (!patch.expected.trim() || (patch.assertion && !isNumberComparison(patch.assertion))) return;
    next = {
      ...current,
      operator: isNumberComparison(patch.assertion)
        ? numberComparisons[patch.assertion].operator
        : current.operator,
      expected: Number(patch.expected),
    };
  } else if (current.type === 'count') {
    if (!patch.expected.trim()) return;
    next = { ...current, expected: Number(patch.expected) };
  } else if (current.type === 'attribute') {
    next = {
      ...current,
      name: patch.attributeName?.trim() || current.name,
      expected: patch.expected,
    };
  } else if (current.type === 'class' || current.type === 'value') {
    next = { ...current, expected: patch.expected };
  } else return;
  const parsed = elementAssertionSchema.safeParse(next);
  return parsed.success ? parsed.data : undefined;
};
