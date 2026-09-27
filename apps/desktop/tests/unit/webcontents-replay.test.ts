import type { WebContents } from 'electron';
import { expect, it, vi } from 'vitest';
import { WebContentsReplay } from '../../src/main/recording/webcontents-replay';

it('resolves root-relative steps on the current origin and still rejects non-HTTP navigation', async () => {
  const contents = {
    getURL: () => 'https://local.example/current',
    loadURL: vi.fn().mockResolvedValue(undefined),
  };
  const replay = new WebContentsReplay(
    () => contents as unknown as WebContents,
    () => ({}),
  );
  const signal = new AbortController().signal;
  const metadata = { recordedAt: new Date(0).toISOString() };
  await replay.execute({ version: 1, kind: 'navigate', metadata, url: '/dashboard?tab=1' }, signal);
  expect(contents.loadURL).toHaveBeenLastCalledWith('https://local.example/dashboard?tab=1');
  await replay.execute(
    { version: 1, kind: 'navigate', metadata, url: 'https://other.example/' },
    signal,
  );
  expect(contents.loadURL).toHaveBeenLastCalledWith('https://other.example/');
  await expect(
    replay.execute({ version: 1, kind: 'navigate', metadata, url: 'file:///tmp/local' }, signal),
  ).rejects.toThrow('Only HTTP(S)');
  expect(contents.loadURL).toHaveBeenCalledTimes(2);
});
