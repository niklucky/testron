import type { Step } from '@testron/domain/steps/schema';

/** Replace a mistakenly recorded action with the assertion it most likely meant. */
export const convertStepToAssertion = (step: Step, currentUrl: string): Step => {
  if (step.kind === 'assertElement' || step.kind === 'assertUrlPath') return step;

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
