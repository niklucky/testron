import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const launch = async (name: string) => {
  const dataDirectory = mkdtempSync(path.join(tmpdir(), `testron-${name}-`));
  const electronApp = await electron.launch({
    args: ['.'],
    env: { ...process.env, TESTRON_DATA_DIR: dataDirectory, TESTRON_LOCAL_MODE: '1' },
  });
  return { electronApp, appWindow: await electronApp.firstWindow(), dataDirectory };
};

const closeElectron = async (electronApp: Awaited<ReturnType<typeof electron.launch>>) => {
  const process = electronApp.process();
  await electronApp.evaluate(({ app }) => app.quit()).catch(() => undefined);
  await Promise.race([
    electronApp.close().catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (process.exitCode === null) process.kill('SIGTERM');
};

test('record screen hotkeys control recording and ignore ordinary keys in the address', async () => {
  const { electronApp, appWindow, dataDirectory } = await launch('record-hotkeys');
  try {
    await appWindow.evaluate(() => (window.location.hash = '#/record'));
    await appWindow.getByLabel('Address').waitFor({ timeout: 10_000 });
    await appWindow.evaluate(() =>
      window.testron.command({ type: 'navigate', url: 'http://127.0.0.1:4174/' }),
    );
    await expect
      .poll(() =>
        electronApp.evaluate(({ webContents }) =>
          webContents
            .getAllWebContents()
            .some((contents) => contents.getURL() === 'http://127.0.0.1:4174/'),
        ),
      )
      .toBe(true);

    await appWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+L' : 'Control+L');
    await expect(appWindow.getByLabel('Address')).toBeFocused();
    await appWindow.getByLabel('Address').press('A');
    await expect(appWindow.getByRole('button', { name: /Assert/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await appWindow.getByLabel('Address').press('Escape');
    await appWindow.keyboard.press('R');
    await expect(appWindow.getByRole('button', { name: /Pause/ })).toBeVisible();
    const addressBounds = (await appWindow.getByLabel('Address').boundingBox())!;

    const sendWebsiteKey = (keyCode: string, typeCharacter = false) =>
      electronApp.evaluate(
        async ({ webContents }, { key, typeCharacter }) => {
          const website = webContents
            .getAllWebContents()
            .find((contents) => contents.getURL() === 'http://127.0.0.1:4174/');
          if (!website) throw new Error('Fixture WebContentsView was not found.');
          website.focus();
          website.sendInputEvent({ type: 'keyDown', keyCode: key });
          if (typeCharacter) website.sendInputEvent({ type: 'char', keyCode: key });
          website.sendInputEvent({ type: 'keyUp', keyCode: key });
        },
        { key: keyCode, typeCharacter },
      );

    await electronApp.evaluate(async ({ webContents }) => {
      const website = webContents
        .getAllWebContents()
        .find((contents) => contents.getURL() === 'http://127.0.0.1:4174/');
      if (!website) throw new Error('Fixture WebContentsView was not found.');
      await website.executeJavaScript(`document.body.focus()`);
    });
    await sendWebsiteKey('A');
    await expect(appWindow.getByRole('button', { name: /Assert/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await electronApp.evaluate(async ({ webContents }) => {
      const website = webContents
        .getAllWebContents()
        .find((contents) => contents.getURL() === 'http://127.0.0.1:4174/');
      if (!website) throw new Error('Fixture WebContentsView was not found.');
      await website.executeJavaScript(`(() => {
        const input = document.querySelector('[data-testid="email"]');
        input.value = '';
        input.focus();
      })()`);
    });
    await sendWebsiteKey('A', true);
    await expect
      .poll(() =>
        electronApp.evaluate(async ({ webContents }) => {
          const website = webContents
            .getAllWebContents()
            .find((contents) => contents.getURL() === 'http://127.0.0.1:4174/');
          return website?.executeJavaScript(
            `document.querySelector('[data-testid="email"]')?.value`,
          );
        }),
      )
      .toBe('A');
    await expect(appWindow.getByRole('button', { name: /Assert/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await electronApp.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.focus();
      window.webContents.focus();
    });
    await appWindow.mouse.click(
      addressBounds.x + addressBounds.width / 2,
      addressBounds.y + addressBounds.height / 2,
    );
    await appWindow.getByLabel('Address').press('Escape');
    await appWindow.keyboard.press('R');
    await expect(appWindow.getByRole('button', { name: /Resume/ })).toBeVisible();
  } finally {
    await closeElectron(electronApp);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});
