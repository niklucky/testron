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
    await appWindow.keyboard.press('R');
    await expect(appWindow.getByRole('button', { name: /Resume/ })).toBeVisible();
  } finally {
    await electronApp.close().catch(() => undefined);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});
