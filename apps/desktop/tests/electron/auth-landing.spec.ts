import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('a configured remote server gates the product behind desktop sign-in', async () => {
  const dataDirectory = mkdtempSync(path.join(tmpdir(), 'testron-auth-landing-'));
  const electronApp = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      TESTRON_DATA_DIR: dataDirectory,
      TESTRON_SERVER_URL: 'http://127.0.0.1:1',
    },
  });

  try {
    const appWindow = await electronApp.firstWindow();
    await expect(
      appWindow.getByRole('heading', {
        name: 'Tests live on your server. Recording stays here.',
      }),
    ).toBeVisible();

    await appWindow.getByRole('button', { name: 'Create account' }).first().click();
    await appWindow.getByLabel('Email address').fill('owner@example.test');
    await appWindow.getByLabel('Password', { exact: true }).fill('correct horse battery staple');
    await appWindow.getByLabel('Confirm password').fill('different password value');
    await appWindow.getByRole('button', { name: 'Create account' }).last().click();
    await expect(appWindow.getByRole('alert')).toHaveText('The passwords do not match.');

    await appWindow.getByRole('button', { name: 'Sign in' }).first().click();
    await appWindow.getByLabel('Password').fill('correct horse battery staple');
    await appWindow.getByRole('button', { name: 'Sign in' }).last().click();
    await expect(appWindow.getByRole('alert')).toBeVisible();
    await expect(appWindow.getByRole('button', { name: 'Sign in' }).last()).toBeVisible();
  } finally {
    await electronApp.close();
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});
