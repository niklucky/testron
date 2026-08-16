import { describe, expect, it, vi } from 'vitest';

import { RecorderNormalizer } from '../../src/recording/normalizer';
import type { ActionCandidate } from '../../src/recording/schema';
import type { Step } from '../../src/steps/schema';

const input = (value: string): Extract<ActionCandidate, { kind: 'input' }> => ({
  kind: 'input',
  url: 'http://127.0.0.1:4174/',
  value,
  target: {
    fingerprint: 'email',
    sensitive: false,
    locators: [{ strategy: 'testId', attribute: 'data-testid', value: 'email' }],
  },
});

describe('RecorderNormalizer', () => {
  it('collapses typing with long pauses into one fill with the final value', () => {
    vi.useFakeTimers();
    const steps: Step[] = [];
    const normalizer = new RecorderNormalizer((step) => steps.push(step));
    normalizer.accept(input('h'));
    vi.advanceTimersByTime(5_000);
    normalizer.accept(input('he'));
    vi.advanceTimersByTime(5_000);
    normalizer.accept(input('hello'));
    vi.advanceTimersByTime(5_000);
    expect(steps).toHaveLength(0);
    normalizer.flush();
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ kind: 'fill', value: 'hello' });
    vi.useRealTimers();
  });

  it('flushes a fill before the next click', () => {
    const steps: Step[] = [];
    const normalizer = new RecorderNormalizer((step) => steps.push(step));
    normalizer.accept(input('qa@example.test'));
    normalizer.accept({
      kind: 'click',
      url: 'http://127.0.0.1:4174/',
      target: {
        fingerprint: 'continue',
        sensitive: false,
        locators: [{ strategy: 'role', role: 'button', name: 'Continue' }],
      },
    });
    expect(steps.map((step) => step.kind)).toEqual(['fill', 'click']);
  });

  it('never stores a sensitive value', () => {
    const steps: Step[] = [];
    const normalizer = new RecorderNormalizer((step) => steps.push(step));
    normalizer.accept({
      ...input('do-not-store'),
      target: { ...input('').target, sensitive: true },
    });
    normalizer.flush();
    expect(steps[0]).toMatchObject({
      kind: 'fill',
      value: '',
      secret: { environmentVariable: 'TESTRON_PASSWORD' },
    });
    expect(JSON.stringify(steps)).not.toContain('do-not-store');
  });

  it('commits a pending fill when its field loses focus', () => {
    const steps: Step[] = [];
    const normalizer = new RecorderNormalizer((step) => steps.push(step));
    normalizer.accept(input('qa@example.test'));
    normalizer.accept({
      kind: 'input-commit',
      fingerprint: 'email',
      url: 'http://127.0.0.1:4174/',
    });
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ kind: 'fill', value: 'qa@example.test' });
  });

  it('normalizes select, checkbox, and meaningful key actions', () => {
    const steps: Step[] = [];
    const normalizer = new RecorderNormalizer((step) => steps.push(step));
    const target = {
      fingerprint: 'control',
      sensitive: false,
      locators: [{ strategy: 'testId' as const, attribute: 'data-testid', value: 'control' }],
    };
    normalizer.accept({
      kind: 'select',
      url: 'http://127.0.0.1:4174/',
      target,
      value: 'staging',
    });
    normalizer.accept({
      kind: 'check',
      url: 'http://127.0.0.1:4174/',
      target,
      checked: true,
    });
    normalizer.accept({
      kind: 'check',
      url: 'http://127.0.0.1:4174/',
      target,
      checked: false,
    });
    normalizer.accept({
      kind: 'press',
      url: 'http://127.0.0.1:4174/',
      target,
      key: 'Enter',
    });
    expect(steps.map((step) => step.kind)).toEqual(['selectOption', 'check', 'uncheck', 'press']);
  });

  it('turns verify observations into structured assertions and retains warnings', () => {
    const steps: Step[] = [];
    const normalizer = new RecorderNormalizer((step) => steps.push(step));
    normalizer.accept({
      kind: 'assertion',
      assertion: 'textContains',
      observedText: 'Signed in',
      observedValue: '',
      url: 'http://127.0.0.1:4174/welcome',
      target: {
        fingerprint: 'heading',
        sensitive: false,
        locators: [
          { strategy: 'role', role: 'heading', name: 'Signed in' },
          { strategy: 'css', selector: 'main > h1', fragile: true },
        ],
        warnings: ['Primary locator is ambiguous (2 matches).'],
      },
    });
    expect(steps[0]).toMatchObject({
      kind: 'assertElement',
      assertion: { type: 'text', match: 'contains', expected: 'Signed in' },
      target: {
        alternatives: [{ strategy: 'css' }],
        warnings: ['Primary locator is ambiguous (2 matches).'],
      },
    });
  });
});
