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

  it('records a manually entered password as its literal value', () => {
    const steps: Step[] = [];
    const normalizer = new RecorderNormalizer((step) => steps.push(step));
    normalizer.accept({
      ...input('test'),
      target: { ...input('').target, sensitive: true },
    });
    normalizer.flush();
    expect(steps[0]).toMatchObject({
      kind: 'fill',
      value: 'test',
    });
    expect(steps[0]).not.toHaveProperty('secret');
  });

  it('records a profile variable reference without its resolved value', () => {
    const steps: Step[] = [];
    const normalizer = new RecorderNormalizer((step) => steps.push(step));
    normalizer.accept({
      ...input('Administrator'),
      target: { ...input('').target, variableName: 'username' },
    });
    normalizer.flush();

    expect(steps[0]).toMatchObject({
      kind: 'fill',
      value: '',
      variable: { name: 'username' },
    });
    expect(JSON.stringify(steps)).not.toContain('Administrator');
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

  it('records exact and minimum collection counts from the observed matches', () => {
    const steps: Step[] = [];
    const normalizer = new RecorderNormalizer((step) => steps.push(step));
    const target = {
      fingerprint: 'rows',
      sensitive: false,
      locators: [{ strategy: 'css' as const, selector: 'tbody > tr', fragile: true as const }],
    };
    normalizer.accept({
      kind: 'assertion',
      assertion: 'countExactly',
      observedText: '',
      observedValue: '',
      observedCount: 20,
      url: 'http://127.0.0.1:4174/',
      target,
    });
    normalizer.accept({
      kind: 'assertion',
      assertion: 'countAtLeast',
      observedText: '',
      observedValue: '',
      observedCount: 20,
      url: 'http://127.0.0.1:4174/',
      target,
    });

    expect(steps.map((step) => ('assertion' in step ? step.assertion : undefined))).toEqual([
      { type: 'count', operator: 'equals', expected: 20 },
      { type: 'count', operator: 'atLeast', expected: 20 },
    ]);
  });
});
