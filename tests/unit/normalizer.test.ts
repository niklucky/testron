import { describe, expect, it, vi } from 'vitest';

import { RecorderNormalizer } from '../../src/domain/recording/normalizer';
import type { ActionCandidate } from '../../src/domain/recording/schema';
import type { Step } from '../../src/domain/steps/schema';

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
    expect(steps[0]).toMatchObject({ kind: 'fill', value: '' });
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
});
