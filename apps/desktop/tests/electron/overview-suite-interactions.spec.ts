import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('overview suite edit, expansion, and test navigation are keyboard accessible', async () => {
  const dataDirectory = mkdtempSync(path.join(tmpdir(), 'testron-overview-suites-'));
  const electronApp = await electron.launch({
    args: ['.'],
    env: { ...process.env, TESTRON_DATA_DIR: dataDirectory },
  });
  const appWindow = await electronApp.firstWindow();

  try {
    await appWindow.getByRole('heading', { name: 'Project overview' }).waitFor({ timeout: 10_000 });

    const edit = appWindow.getByRole('button', { name: 'Edit Authentication test suite' });
    await edit.focus();
    await edit.press('Enter');
    const dialog = appWindow.getByRole('dialog', { name: 'Update test suite' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Name')).toHaveValue('Authentication');
    await dialog.press('Escape');

    const expand = appWindow.getByRole('button', {
      name: 'Expand Authentication test suite',
    });
    const sidebarToggle = appWindow
      .locator('aside button[aria-expanded]')
      .filter({ hasText: 'Authentication' });
    await expect(expand).toHaveAttribute('aria-expanded', 'false');
    await expect(sidebarToggle).toHaveAttribute('aria-expanded', 'false');
    await expand.focus();
    await expand.press('Enter');

    const collapse = appWindow.getByRole('button', {
      name: 'Collapse Authentication test suite',
    });
    await expect(collapse).toHaveAttribute('aria-expanded', 'true');
    await expect(sidebarToggle).toHaveAttribute('aria-expanded', 'false');
    const tests = appWindow.getByRole('list', { name: 'Authentication tests' });
    await expect(tests).toBeVisible();

    const openTest = tests.getByRole('button', { name: /Sign in with an existing account/ });
    await openTest.focus();
    await openTest.press('Enter');
    await expect.poll(() => appWindow.evaluate(() => window.location.hash)).toBe('#/test');
  } finally {
    await electronApp.close().catch(() => undefined);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});
