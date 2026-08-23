import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { AppSnapshot } from '../../src/preload/api';

const appSnapshot = (appWindow: Page) =>
  appWindow.evaluate(
    () =>
      new Promise<AppSnapshot>((resolve) => {
        const stop = window.testron.onSnapshot((snapshot) => {
          stop();
          resolve(snapshot);
        });
        window.testron.command({ type: 'request-snapshot' });
      }),
  );

const closeElectron = async (electronApp: Awaited<ReturnType<typeof electron.launch>>) => {
  let process: ReturnType<typeof electronApp.process> | undefined;
  try {
    process = electronApp.process();
  } catch {
    return;
  }
  await electronApp.evaluate(({ app }) => app.quit()).catch(() => undefined);
  await Promise.race([
    electronApp.close().catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (process.exitCode === null) process.kill('SIGTERM');
};

// The installation dialog is hosted by the webapp and is no longer rendered in the local bundle.
test.skip('offers to download Chromium before the first local run', async () => {
  const dataDirectory = mkdtempSync(path.join(tmpdir(), 'testron-browser-modal-'));
  const electronApp = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      TESTRON_DATA_DIR: dataDirectory,
      TESTRON_BROWSERS_PATH: path.join(dataDirectory, 'browsers'),
      TESTRON_LOCAL_MODE: '1',
    },
  });
  try {
    const appWindow = await electronApp.firstWindow();
    await expect
      .poll(async () => (await appSnapshot(appWindow)).browserInstallation.status)
      .toBe('missing');

    appWindow.evaluate(() => window.testron.command({ type: 'create-project', name: 'Checkout' }));
    await expect.poll(async () => (await appSnapshot(appWindow)).library.projects.length).toBe(1);
    const projectId = (await appSnapshot(appWindow)).library.selectedProjectId!;
    appWindow.evaluate(
      (id) =>
        window.testron.command({
          type: 'create-environment',
          projectId: id,
          name: 'Local',
          baseUrl: 'https://example.test',
          testIdAttribute: 'data-testid',
        }),
      projectId,
    );
    await expect
      .poll(async () => (await appSnapshot(appWindow)).library.selectedEnvironmentId)
      .toBeTruthy();
    const environmentId = (await appSnapshot(appWindow)).library.selectedEnvironmentId!;
    appWindow.evaluate(
      ({ projectId, environmentId }) =>
        window.testron.command({
          type: 'create-test',
          projectId,
          environmentIds: [environmentId],
          title: 'First run',
        }),
      { projectId, environmentId },
    );
    await expect
      .poll(async () => (await appSnapshot(appWindow)).library.selectedTestId)
      .toBeTruthy();
    appWindow.evaluate(() => {
      window.testron.command({
        type: 'replace-steps',
        steps: [
          {
            version: 1,
            kind: 'navigate',
            url: 'https://example.test',
            metadata: { recordedAt: new Date().toISOString() },
          },
        ],
      });
      window.location.hash = '#/test';
    });

    await appWindow.getByRole('button', { name: /^Run on / }).click();
    const dialog = appWindow.getByRole('dialog', { name: 'Chromium is required' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Download and install' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Not now' }).click();
    await expect(dialog).toBeHidden();
  } finally {
    await closeElectron(electronApp);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});
