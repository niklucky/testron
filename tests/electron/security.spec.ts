import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const openRecorder = async (appWindow: Page) => {
  await appWindow.evaluate(() => {
    window.location.hash = '#/recorder';
  });
  await appWindow.getByRole('button', { name: 'Start recording' }).waitFor({ timeout: 3_000 });
};

test('the tested website has no privileged renderer surface', async () => {
  const electronApp = await electron.launch({ args: ['.'] });
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
    });
    expect(result.surface).toEqual({
      requireType: 'undefined',
      processType: 'undefined',
      testronType: 'undefined',
      electronType: 'undefined',
    });
  } finally {
    await electronApp.close();
  }
});

test('records the controlled login-like flow through the Electron pipeline', async () => {
  const electronApp = await electron.launch({ args: ['.'] });
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

    await expect(appWindow.locator('.human li')).toHaveCount(4);
    await expect(appWindow.locator('.human')).toContainText(
      'Navigate to http://127.0.0.1:4174/?recording=1',
    );
    await expect(appWindow.locator('.human')).toContainText('Fill [data-testid="email"]');
    await expect(appWindow.locator('.human')).toContainText('Fill [data-testid="workspace"]');
    await expect(appWindow.locator('.human')).toContainText('Click button “Continue”');
    await expect(appWindow.locator('.source pre')).toContainText(
      "page.getByRole('button', { name: 'Continue' }).click()",
    );
  } finally {
    await electronApp.close();
  }
});

test('restores a created project, environment, test, and its steps after restart', async () => {
  const dataDirectory = mkdtempSync(path.join(tmpdir(), 'testron-electron-'));
  const launch = () =>
    electron.launch({
      args: ['.'],
      env: { ...process.env, TESTRON_DATA_DIR: dataDirectory },
    });
  let electronApp = await launch();
  try {
    let appWindow = await electronApp.firstWindow();
    await openRecorder(appWindow);
    await appWindow.getByLabel('New project name').fill('Checkout');
    await appWindow.locator('.entity').nth(0).getByRole('button', { name: 'Add' }).click();
    await expect(appWindow.getByLabel('Project', { exact: true })).toHaveValue(/.+/);

    await appWindow.getByLabel('New environment name').fill('Local');
    await appWindow.getByLabel('Environment base URL').fill('http://127.0.0.1:4174');
    await appWindow.getByLabel('Test ID attribute').fill('data-testid');
    await appWindow.locator('.entity').nth(1).getByRole('button', { name: 'Add' }).click();
    await expect(appWindow.getByLabel('Environment', { exact: true })).toHaveValue(/.+/);

    await appWindow.getByLabel('New test title').fill('sign in successfully');
    await appWindow.locator('.entity').nth(2).getByRole('button', { name: 'Add' }).click();
    await expect(appWindow.getByLabel('Test', { exact: true })).toHaveValue(/.+/);
    await appWindow.getByRole('button', { name: 'Start recording' }).click();
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
    await appWindow.getByRole('button', { name: 'Finish' }).click();
    await expect(appWindow.locator('.human li')).toHaveCount(2);
    await electronApp.close();

    electronApp = await launch();
    appWindow = await electronApp.firstWindow();
    await openRecorder(appWindow);
    await expect(appWindow.getByLabel('Project', { exact: true })).toContainText('Checkout');
    await expect(appWindow.getByLabel('Environment', { exact: true })).toContainText('Local');
    await expect(appWindow.getByLabel('Test', { exact: true })).toContainText(
      'sign in successfully',
    );
    await expect(appWindow.locator('.human li')).toHaveCount(2);
    await expect(appWindow.locator('.human')).toContainText('qa@example.test');
  } finally {
    await electronApp.close().catch(() => undefined);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});
