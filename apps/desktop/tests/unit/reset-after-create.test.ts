import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetBrowserAfterTestCreation } from '../../src/main/recording/reset-after-create';

afterEach(() => vi.restoreAllMocks());

describe('browser reset after persisted test creation', () => {
  it('waits for reset before continuing synchronization', async () => {
    const warn = vi.fn();
    let release!: () => void;
    const reset = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const synchronize = vi.fn();
    const completion = resetBrowserAfterTestCreation(reset, warn).then(synchronize);
    expect(synchronize).not.toHaveBeenCalled();
    release();
    await completion;
    expect(synchronize).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([new Error('ERR_CONNECTION_REFUSED'), 'unexpected reset failure'])(
    'reports reset failure without rejecting creation: %s',
    async (error) => {
      const log = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const warn = vi.fn();
      const synchronize = vi.fn();
      await expect(
        resetBrowserAfterTestCreation(async () => {
          throw error;
        }, warn).then(synchronize),
      ).resolves.toBeUndefined();
      expect(synchronize).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledWith('Test created, but browser session reset failed.', error);
      expect(warn).toHaveBeenCalledWith(
        error instanceof Error ? error.message : 'Browser session reset failed.',
      );
    },
  );
});
