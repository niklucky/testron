import { describe, expect, it, vi } from 'vitest';
import type { Step } from '@testron/domain/steps/schema';
import { StepReplay } from '../../src/main/recording/step-replay';

const metadata = { recordedAt: new Date(0).toISOString() };
const steps: Step[] = [
  { version: 1, kind: 'navigate', url: 'https://example.test', metadata },
  {
    version: 1,
    kind: 'fill',
    value: 'hello',
    metadata,
    target: { primary: { strategy: 'id', value: 'name' }, alternatives: [] },
  },
  { version: 1, kind: 'navigate', url: 'https://example.test/next', metadata },
];
const setup = () => {
  const driver = {
    reset: vi.fn(async () => {}),
    execute: vi.fn(async (_step: Step, _signal: AbortSignal) => {}),
    highlight: vi.fn(async () => {}),
  };
  const changed = vi.fn();
  return { driver, changed, replay: new StepReplay(driver, changed) };
};

describe('StepReplay', () => {
  it('replays forward incrementally and resets for backward selection', async () => {
    const { driver, replay } = setup();
    await replay.select(steps, 1);
    await replay.select(steps, 2);
    expect(driver.reset).toHaveBeenCalledTimes(1);
    expect(driver.execute.mock.calls.map(([step]) => step)).toEqual(steps);
    await replay.select(steps, 0);
    expect(driver.reset).toHaveBeenCalledTimes(2);
    expect(driver.execute).toHaveBeenLastCalledWith(steps[0], expect.any(AbortSignal));
    expect(replay.snapshot()).toMatchObject({ status: 'synced', appliedIndex: 0 });
  });

  it('rebuilds the browser when a fill is deleted or edited', async () => {
    const { driver, replay } = setup();
    await replay.select(steps, 2);
    await replay.select([steps[0]!, steps[2]!], 1);
    expect(driver.reset).toHaveBeenCalledTimes(2);
    await replay.select([steps[0]!, { ...steps[1]!, value: 'changed' } as Step], 1);
    expect(driver.reset).toHaveBeenCalledTimes(3);
  });

  it('resets to the starting page when the last remaining step is deleted', async () => {
    const { driver, replay } = setup();
    await replay.select(steps, 0);
    await replay.select([], -1);
    expect(driver.reset).toHaveBeenCalledTimes(2);
    expect(replay.snapshot()).toMatchObject({ status: 'synced', appliedIndex: -1 });
  });

  it('cancels a slow action before executing the latest selection', async () => {
    const { driver, replay, changed } = setup();
    let started!: () => void;
    const starting = new Promise<void>((resolve) => {
      started = resolve;
    });
    driver.execute.mockImplementationOnce(async (_step, signal) => {
      started();
      await new Promise<void>((_, reject) =>
        signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }),
      );
    });
    const first = replay.select(steps, 2);
    await starting;
    const second = replay.select(steps, 1);
    await Promise.all([first, second]);
    expect(driver.reset).toHaveBeenCalledTimes(2);
    expect(replay.snapshot()).toMatchObject({ status: 'synced', appliedIndex: 1 });
    expect(
      changed.mock.calls.some(([state]) => state.status === 'synced' && state.appliedIndex === 2),
    ).toBe(false);
  });

  it('stops at failures and forces a reset on retry', async () => {
    const { driver, replay } = setup();
    driver.execute.mockRejectedValueOnce(new Error('missing element'));
    await replay.select(steps, 2);
    expect(driver.execute).toHaveBeenCalledTimes(1);
    expect(replay.snapshot()).toMatchObject({ status: 'failed', error: 'missing element' });
    await replay.select(steps, 1);
    expect(driver.reset).toHaveBeenCalledTimes(2);
    expect(replay.snapshot().status).toBe('synced');
  });

  it('allows selection before exact code and rejects crossing it before browser effects', async () => {
    const { driver, replay } = setup();
    const withCode: Step[] = [
      steps[0]!,
      { version: 1, kind: 'code', code: 'custom();', reason: 'custom', metadata },
    ];
    await replay.select(withCode, 1);
    expect(driver.reset).not.toHaveBeenCalled();
    expect(driver.execute).not.toHaveBeenCalled();
    expect(replay.snapshot().status).toBe('failed');
    await replay.select(withCode, 0);
    expect(replay.snapshot().status).toBe('synced');
  });

  it('invalidates in-flight replay when changing documents', async () => {
    const { driver, replay } = setup();
    let finish!: () => void;
    driver.reset.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const first = replay.select(steps, 2);
    await Promise.resolve();
    replay.invalidate();
    finish();
    await first;
    expect(driver.execute).not.toHaveBeenCalled();
    expect(replay.snapshot().status).toBe('idle');
  });
});
