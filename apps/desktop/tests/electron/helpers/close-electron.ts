import type { ElectronApplication } from '@playwright/test';

const within = async (operation: Promise<unknown>, timeoutMs: number) => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      operation,
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
};

/** Wait for the process, not just the window, before releasing test resources. */
export const closeElectron = async (app: ElectronApplication) => {
  const child = app.process();
  const running = () => child.exitCode === null && child.signalCode === null;
  const exited = running()
    ? new Promise<void>((resolve) => child.once('exit', () => resolve()))
    : Promise.resolve();
  await within(
    app.close().catch(() => undefined),
    5_000,
  );
  if (running()) child.kill('SIGTERM');
  await within(exited, 5_000);
  if (running()) child.kill('SIGKILL');
  await within(exited, 5_000);
  if (running()) throw new Error('Electron test process did not exit.');
};
