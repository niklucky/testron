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
  const process = electronApp.process();
  await electronApp.evaluate(({ app }) => app.quit()).catch(() => undefined);
  await Promise.race([
    electronApp.close().catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (process.exitCode === null) process.kill('SIGTERM');
};

const launchLocal = (dataDirectory: string) =>
  electron.launch({
    args: ['.'],
    env: { ...process.env, TESTRON_DATA_DIR: dataDirectory, TESTRON_LOCAL_MODE: '1' },
  });

const openRecorder = async (appWindow: Page) => {
  await appWindow.evaluate(() => {
    window.location.hash = '#/record';
  });
  await appWindow
    .getByRole('button', { name: 'Record R', exact: true })
    .waitFor({ timeout: 10_000 });
  await appWindow.evaluate(() =>
    window.testron.command({ type: 'navigate', url: 'http://127.0.0.1:4174/' }),
  );
};

test('does not preload the local fixture before a target is selected', async () => {
  const dataDirectory = mkdtempSync(path.join(tmpdir(), 'testron-security-empty-'));
  const electronApp = await launchLocal(dataDirectory);
  try {
    await electronApp.firstWindow();
    await expect
      .poll(() =>
        electronApp.evaluate(({ webContents }) =>
          webContents.getAllWebContents().filter((contents) => contents.getType() === 'webview'),
        ),
      )
      .toEqual([]);
    await expect
      .poll(() =>
        electronApp.evaluate(({ webContents }) =>
          webContents
            .getAllWebContents()
            .some((contents) => contents.getURL().startsWith('http://127.0.0.1:4174')),
        ),
      )
      .toBe(false);
  } finally {
    await closeElectron(electronApp);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('the tested website has no privileged renderer surface', async () => {
  const dataDirectory = mkdtempSync(path.join(tmpdir(), 'testron-security-surface-'));
  const electronApp = await launchLocal(dataDirectory);
  try {
    const appWindow = await electronApp.firstWindow();
    await openRecorder(appWindow);
    await expect
      .poll(() =>
        electronApp.evaluate(({ webContents }) =>
          webContents.getAllWebContents().map((contents) => contents.getURL()),
        ),
      )
      .toContain('http://127.0.0.1:4174/');
    const result = await electronApp.evaluate(async ({ webContents }) => {
      const website = webContents
        .getAllWebContents()
        .find((contents) => contents.getURL().startsWith('http://127.0.0.1:4174'));
      if (!website) throw new Error('Fixture WebContentsView was not found.');

      const surface = (await website.executeJavaScript(`({
        requireType: typeof window.require,
        processType: typeof window.process,
        testronType: typeof window.testron,
        electronType: typeof window.electron
      })`)) as Record<string, string>;

      return {
        preferences: (
          website as typeof website & {
            getLastWebPreferences(): Record<string, unknown>;
          }
        ).getLastWebPreferences(),
        surface,
      };
    });

    expect(result.preferences).toMatchObject({
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    });
    expect(result.surface).toEqual({
      requireType: 'undefined',
      processType: 'undefined',
      testronType: 'undefined',
      electronType: 'undefined',
    });
  } finally {
    await closeElectron(electronApp);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('records the controlled login-like flow through the Electron pipeline', async () => {
  const dataDirectory = mkdtempSync(path.join(tmpdir(), 'testron-security-record-'));
  const electronApp = await launchLocal(dataDirectory);
  try {
    const appWindow = await electronApp.firstWindow();
    await openRecorder(appWindow);
    await expect
      .poll(() =>
        electronApp.evaluate(({ webContents }) =>
          webContents.getAllWebContents().map((contents) => contents.getURL()),
        ),
      )
      .toContain('http://127.0.0.1:4174/');
    await appWindow.evaluate(() => window.testron.command({ type: 'start-recording' }));
    await appWindow.evaluate(() =>
      window.testron.command({ type: 'navigate', url: 'http://127.0.0.1:4174/?recording=1' }),
    );

    await expect
      .poll(() =>
        electronApp.evaluate(({ webContents }) =>
          webContents.getAllWebContents().map((contents) => contents.getURL()),
        ),
      )
      .toContain('http://127.0.0.1:4174/?recording=1');

    await electronApp.evaluate(async ({ webContents }) => {
      const website = webContents
        .getAllWebContents()
        .find((contents) => contents.getURL() === 'http://127.0.0.1:4174/?recording=1');
      if (!website) throw new Error('Fixture WebContentsView was not found.');
      await website.executeJavaScript(`(() => {
        const fill = (selector, value) => {
          const input = document.querySelector(selector);
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        };
        fill('[data-testid="email"]', 'qa@example.test');
        fill('[data-testid="workspace"]', 'quality-lab');
        return true;
      })()`);
    });
    await electronApp.evaluate(({ webContents }) => {
      const website = webContents
        .getAllWebContents()
        .find((contents) => contents.getURL() === 'http://127.0.0.1:4174/?recording=1');
      if (!website) throw new Error('Fixture WebContentsView was not found.');
      void website.executeJavaScript(`document.querySelector('button').click()`);
    });

    await expect
      .poll(() =>
        electronApp.evaluate(({ webContents }) =>
          webContents.getAllWebContents().map((contents) => contents.getURL()),
        ),
      )
      .toContain('http://127.0.0.1:4174/welcome');
    await appWindow.evaluate(() => window.testron.command({ type: 'stop-recording' }));

    const snapshot = await appSnapshot(appWindow);
    expect(snapshot.steps).toHaveLength(5);
    expect(snapshot.descriptions.join('\n')).toContain(
      'Navigate to http://127.0.0.1:4174/?recording=1',
    );
    expect(snapshot.descriptions.join('\n')).toContain('Fill [data-testid="email"]');
    expect(snapshot.descriptions.join('\n')).toContain('Fill [data-testid="workspace"]');
    expect(snapshot.descriptions.join('\n')).toContain('Click button “Continue”');
    expect(snapshot.source).toContain("page.getByRole('button', { name: 'Continue' }).click()");
  } finally {
    await closeElectron(electronApp);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('restores a created project, environment, test, and its steps after restart', async () => {
  test.setTimeout(60_000);
  const dataDirectory = mkdtempSync(path.join(tmpdir(), 'testron-electron-'));
  const launch = () =>
    electron.launch({
      args: ['.'],
      env: { ...process.env, TESTRON_DATA_DIR: dataDirectory, TESTRON_LOCAL_MODE: '1' },
    });
  let electronApp = await launch();
  try {
    let appWindow = await electronApp.firstWindow();
    await openRecorder(appWindow);
    appWindow.evaluate(() => window.testron.command({ type: 'create-project', name: 'Checkout' }));
    await expect.poll(async () => (await appSnapshot(appWindow)).library.projects.length).toBe(1);
    const projectId = (await appSnapshot(appWindow)).library.selectedProjectId!;
    appWindow.evaluate(
      (id) =>
        window.testron.command({
          type: 'create-environment',
          projectId: id,
          name: 'Local',
          baseUrl: 'http://127.0.0.1:4174',
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
          environmentId,
          title: 'sign in successfully',
        }),
      { projectId, environmentId },
    );
    await expect
      .poll(async () => (await appSnapshot(appWindow)).library.selectedTestId)
      .toBeTruthy();
    await appWindow.evaluate(() => window.testron.command({ type: 'start-recording' }));
    await appWindow.evaluate(() =>
      window.testron.command({ type: 'navigate', url: 'http://127.0.0.1:4174/?persist=1' }),
    );
    await expect
      .poll(() =>
        electronApp.evaluate(({ webContents }) =>
          webContents.getAllWebContents().map((contents) => contents.getURL()),
        ),
      )
      .toContain('http://127.0.0.1:4174/?persist=1');
    await electronApp.evaluate(async ({ webContents }) => {
      const website = webContents
        .getAllWebContents()
        .find((contents) => contents.getURL() === 'http://127.0.0.1:4174/?persist=1');
      if (!website) throw new Error('Fixture WebContentsView was not found.');
      await website.executeJavaScript(`(() => {
        const input = document.querySelector('[data-testid="email"]');
        input.value = 'qa@example.test';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
    });
    await appWindow.evaluate(() => window.testron.command({ type: 'finish-recording' }));
    await expect.poll(async () => (await appSnapshot(appWindow)).steps.length).toBeGreaterThan(2);
    const recordedStepCount = (await appSnapshot(appWindow)).steps.length;
    await closeElectron(electronApp);

    electronApp = await launch();
    appWindow = await electronApp.firstWindow();
    await openRecorder(appWindow);
    const restored = await appSnapshot(appWindow);
    expect(restored.library.projects.map((project) => project.name)).toContain('Checkout');
    expect(restored.library.environments.map((environment) => environment.name)).toContain('Local');
    const testRecord = restored.library.tests.find((test) => test.title === 'sign in successfully');
    expect(testRecord).toBeDefined();
    await appWindow.evaluate(
      (testId) => window.testron.command({ type: 'select-test', testId }),
      testRecord!.id,
    );
    await expect
      .poll(async () => (await appSnapshot(appWindow)).steps.length)
      .toBe(recordedStepCount);
    expect((await appSnapshot(appWindow)).descriptions.join('\n')).toContain('qa@example.test');
  } finally {
    await closeElectron(electronApp);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});
