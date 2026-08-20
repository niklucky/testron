import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('dashboard hotkeys navigate, open Jump to, and stay quiet while typing', async () => {
  const dataDirectory = mkdtempSync(path.join(tmpdir(), 'testron-hotkeys-'));
  const electronApp = await electron.launch({
    args: ['.'],
    env: { ...process.env, TESTRON_DATA_DIR: dataDirectory },
  });
  const appWindow = await electronApp.firstWindow();

  try {
    await appWindow.getByRole('button', { name: 'Jump to…' }).waitFor({ timeout: 10_000 });

    await appWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
    const jumpDialog = appWindow.getByRole('dialog', { name: 'Jump to' });
    await expect(jumpDialog).toBeVisible();
    await jumpDialog.getByPlaceholder('Search views, test suites, and tests…').fill('run history');
    await appWindow.keyboard.press('Enter');
    await expect(appWindow.getByRole('button', { name: 'Run history' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await appWindow.keyboard.press('T');
    await expect(appWindow.getByRole('button', { name: 'Triage' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await appWindow.keyboard.press('/');
    const filter = appWindow.getByLabel('Filter the triage queue');
    await expect(filter).toBeFocused();
    await filter.fill('payment');
    await filter.press('O');
    await expect(appWindow.getByRole('button', { name: 'Triage' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await filter.press('Escape');
    await expect(filter).toHaveCount(0);
  } finally {
    await electronApp.close();
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});
