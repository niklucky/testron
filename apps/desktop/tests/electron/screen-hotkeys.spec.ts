import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const launch = async (name: string) => {
  const dataDirectory = mkdtempSync(path.join(tmpdir(), `testron-${name}-`));
  const electronApp = await electron.launch({
    args: ['.'],
    env: { ...process.env, TESTRON_DATA_DIR: dataDirectory },
  });
  return { electronApp, appWindow: await electronApp.firstWindow(), dataDirectory };
};

test('record screen hotkeys control recording and ignore ordinary keys in the address', async () => {
  const { electronApp, appWindow, dataDirectory } = await launch('record-hotkeys');
  try {
    await appWindow.evaluate(() => (window.location.hash = '#/record'));
    await appWindow.getByLabel('Address').waitFor({ timeout: 10_000 });

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

    const sendWebsiteKey = (keyCode: string, typeCharacter = false) =>
      electronApp.evaluate(async ({ webContents }, { key, typeCharacter }) => {
        const website = webContents
          .getAllWebContents()
          .find((contents) => contents.getURL() === 'http://127.0.0.1:4174/');
        if (!website) throw new Error('Fixture WebContentsView was not found.');
        website.focus();
        website.sendInputEvent({ type: 'keyDown', keyCode: key });
        if (typeCharacter) website.sendInputEvent({ type: 'char', keyCode: key });
        website.sendInputEvent({ type: 'keyUp', keyCode: key });
      }, { key: keyCode, typeCharacter });

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

    await appWindow.getByLabel('Address').click();
    await appWindow.getByLabel('Address').press('Escape');
    await appWindow.keyboard.press('R');
    await expect(appWindow.getByRole('button', { name: /Resume/ })).toBeVisible();
  } finally {
    await electronApp.close().catch(() => undefined);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});
