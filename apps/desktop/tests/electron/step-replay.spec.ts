import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AppSnapshot } from '../../src/preload/api';

const snapshot = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<AppSnapshot>((resolve) => {
        const stop = window.testron.onSnapshot((value) => {
          stop();
          resolve(value);
        });
        window.testron.command({ type: 'request-snapshot' });
      }),
  );

test('step selection, deletion and code editing keep the tested browser at the requested step', async () => {
  test.setTimeout(90_000);
  const dataDirectory = mkdtempSync(path.join(tmpdir(), 'testron-step-replay-'));
  const app = await electron.launch({
    ...(process.env.TESTRON_ELECTRON_EXECUTABLE
      ? { executablePath: process.env.TESTRON_ELECTRON_EXECUTABLE, args: [] }
      : { args: ['.'] }),
    env: {
      ...process.env,
      TESTRON_DATA_DIR: dataDirectory,
      TESTRON_LOCAL_MODE: '1',
    },
  });
  try {
    const page = await app.firstWindow();
    page.on('pageerror', (error) => console.error('Renderer error:', error));
    page.on('console', (message) => {
      if (message.type() === 'error') console.error(message.text());
    });
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => {
      window.location.hash = '#/record';
    });
    await page.getByRole('button', { name: /^(Record|Continue recording)\s*R$/ }).waitFor();
    await page.evaluate(() =>
      window.testron.command({ type: 'navigate', url: 'http://127.0.0.1:4174/' }),
    );
    const browser = () =>
      app.evaluate(async ({ webContents }) => {
        const target = webContents
          .getAllWebContents()
          .find((contents) => contents.getType() === 'webview');
        if (!target) return undefined;
        return {
          url: target.getURL(),
          ...(await target.executeJavaScript(`({
        email: document.querySelector('#email')?.value,
        password: document.querySelector('#password')?.value,
        highlighted: Boolean(document.getElementById('__testron_step_replay_highlight__'))
      })`)),
        };
      });
    await expect.poll(async () => (await browser())?.url).toBe('http://127.0.0.1:4174/');
    const source = `import { test } from '@playwright/test';
      test('Replay selection', async ({ page }) => {
        await page.goto('http://127.0.0.1:4174/');
        await page.getByTestId('email').fill('qa@example.com');
        await page.getByTestId('password').fill('example-password');
        await page.goto('http://127.0.0.1:4174/welcome');
      });`;
    await page.evaluate(
      (source) => window.testron.command({ type: 'update-source', source }),
      source,
    );
    await expect.poll(async () => (await snapshot(page)).steps.length).toBe(4);
    const select = async (index: number) => {
      await page.locator('ol > li > [role="button"]').nth(index).click();
      await expect
        .poll(async () => (await snapshot(page)).stepReplay, { timeout: 15_000 })
        .toMatchObject({ status: 'synced', appliedIndex: index });
    };
    await select(2);
    expect(await browser()).toMatchObject({
      email: 'qa@example.com',
      password: 'example-password',
      highlighted: true,
    });
    await select(1);
    expect(await browser()).toMatchObject({ email: 'qa@example.com', password: '' });
    await select(3);
    expect((await browser())?.url).toBe('http://127.0.0.1:4174/welcome');
    await select(0);
    expect(await browser()).toMatchObject({ email: '', password: '' });
    await select(1);
    await app.evaluate(async ({ webContents }) => {
      const target = webContents
        .getAllWebContents()
        .find((contents) => contents.getType() === 'webview')!;
      await target.hostWebContents!.executeJavaScript("document.querySelector('webview').focus()");
      target.focus();
      await target.executeJavaScript("document.querySelector('#email').focus()");
      await target.insertText('manual');
    });
    await expect.poll(async () => (await snapshot(page)).stepReplay?.status).toBe('idle');
    expect((await browser())?.email).toContain('manual');
    await select(1);
    expect((await browser())?.email).toBe('qa@example.com');
    const edited = source.replace('qa@example.com', 'edited@example.com');
    const editor = page.getByRole('textbox', { name: 'Test source' });
    await editor.fill(edited);
    await expect.poll(async () => (await snapshot(page)).source).toBe(edited);
    expect((await browser())?.email).toBe('qa@example.com');
    await select(1);
    expect((await browser())?.email).toBe('edited@example.com');
    await page.evaluate(() => window.testron.command({ type: 'delete-step', index: 1 }));
    await expect
      .poll(async () => (await snapshot(page)).stepReplay, { timeout: 15_000 })
      .toMatchObject({ status: 'synced', appliedIndex: 0 });
    expect((await browser())?.email).toBe('');
    expect((await snapshot(page)).steps).toHaveLength(3);
    await page.evaluate(() => {
      window.testron.command({ type: 'select-step', index: 2 });
      window.testron.command({ type: 'select-step', index: 0 });
    });
    await expect
      .poll(async () => (await snapshot(page)).stepReplay, { timeout: 15_000 })
      .toMatchObject({ status: 'synced', appliedIndex: 0 });
    expect((await browser())?.email).toBe('');
    expect((await snapshot(page)).steps).toHaveLength(3);

    for (const action of [
      "await page.getByRole('button', { name: 'Continue' }).click();",
      "await page.getByTestId('password').press('Enter');",
    ]) {
      const submission = source.replace(
        "await page.goto('http://127.0.0.1:4174/welcome');",
        action,
      );
      await page.evaluate(
        (source) => window.testron.command({ type: 'update-source', source }),
        submission,
      );
      await expect.poll(async () => (await snapshot(page)).source).toBe(submission);
      await select(3);
      expect((await browser())?.url).toBe('http://127.0.0.1:4174/welcome');
    }
    const checked = `import { test, expect } from '@playwright/test';
      test('checked', async ({ page }) => {
        await page.goto('http://127.0.0.1:4174/');
        await page.locator('input[type="radio"]').check();
        await expect(page.locator('input[type="radio"]')).toBeChecked();
        await page.getByRole('button', { name: 'Re-render form' }).hover();
        await page.getByRole('button', { name: 'Re-render form' }).click();
        await expect(page.getByTestId('render-status')).toBeVisible();
      });`;
    await page.evaluate(
      (source) => window.testron.command({ type: 'update-source', source }),
      checked,
    );
    await expect.poll(async () => (await snapshot(page)).steps.length).toBe(6);
    await select(5);
    await select(0);
    expect((await snapshot(page)).steps).toHaveLength(6);

    await page.evaluate(() => window.testron.command({ type: 'resume-recording' }));
    await expect.poll(async () => (await snapshot(page)).recording).toBe(true);
    await expect
      .poll(async () => (await snapshot(page)).stepReplay, { timeout: 15_000 })
      .toMatchObject({ status: 'synced', appliedIndex: 5 });
    expect((await snapshot(page)).steps).toHaveLength(6);
    await page.evaluate(() => window.testron.command({ type: 'pause-recording' }));

    const slow = source.replace("page.getByTestId('email')", "page.getByTestId('never-mounted')");
    await page.evaluate(
      (source) => window.testron.command({ type: 'update-source', source }),
      slow,
    );
    await expect.poll(async () => (await snapshot(page)).source).toBe(slow);
    await page.evaluate(() => window.testron.command({ type: 'select-step', index: 1 }));
    await expect
      .poll(async () => (await snapshot(page)).stepReplay)
      .toMatchObject({ status: 'syncing', appliedIndex: 0 });
    await select(0);
    expect((await browser())?.email).toBe('');
  } finally {
    await app.close();
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('reopening the recorder reattaches its tested browser before replay', async () => {
  test.setTimeout(60_000);
  const dataDirectory = mkdtempSync(path.join(tmpdir(), 'testron-reopen-replay-'));
  const app = await electron.launch({
    ...(process.env.TESTRON_ELECTRON_EXECUTABLE
      ? { executablePath: process.env.TESTRON_ELECTRON_EXECUTABLE, args: [] }
      : { args: ['.'] }),
    env: { ...process.env, TESTRON_DATA_DIR: dataDirectory, TESTRON_LOCAL_MODE: '1' },
  });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => {
      window.location.hash = '#/record';
    });
    await page.getByRole('button', { name: /^(Record|Continue recording)\s*R$/ }).waitFor();
    await page.evaluate(() => window.testron.command({ type: 'create-project', name: 'Replay' }));
    await expect.poll(async () => (await snapshot(page)).library.selectedProjectId).toBeTruthy();
    const projectId = (await snapshot(page)).library.selectedProjectId!;
    await page.evaluate(
      (projectId) =>
        window.testron.command({
          type: 'create-environment',
          projectId,
          name: 'Local',
          baseUrl: 'http://127.0.0.1:4174/',
          testIdAttribute: 'data-testid',
        }),
      projectId,
    );
    await expect.poll(async () => (await snapshot(page)).currentUrl).toBe('http://127.0.0.1:4174/');
    await page.evaluate(() =>
      window.testron.command({
        type: 'update-source',
        source: `
      import { test } from '@playwright/test';
      test('Reopen', async ({ page }) => {
        await page.goto('http://127.0.0.1:4174/');
        await page.getByTestId('email').fill('reopened@example.com');
      });
    `,
      }),
    );
    await expect.poll(async () => (await snapshot(page)).steps.length).toBe(2);
    await page.locator('ol > li > [role="button"]').nth(1).click();
    await expect
      .poll(async () => (await snapshot(page)).stepReplay)
      .toMatchObject({ status: 'synced', appliedIndex: 1 });
    await page.evaluate(() => window.testron.command({ type: 'show-product' }));
    await expect
      .poll(() =>
        app.evaluate(
          ({ webContents }) =>
            webContents.getAllWebContents().filter((c) => c.getType() === 'webview').length,
        ),
      )
      .toBe(0);
    // Opening the same recorder route can be an in-page navigation. The React
    // screen stays mounted even though leaving it closed its guest WebContents.
    await app.evaluate(async ({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0].webContents;
      await contents.loadURL(contents.getURL());
    });
    await page.locator('ol > li > [role="button"]').nth(1).click();
    await expect
      .poll(async () => (await snapshot(page)).stepReplay)
      .toMatchObject({ status: 'synced', appliedIndex: 1 });
    expect(
      await app.evaluate(async ({ webContents }) => {
        const target = webContents.getAllWebContents().find((c) => c.getType() === 'webview')!;
        return target.executeJavaScript("document.querySelector('#email').value");
      }),
    ).toBe('reopened@example.com');
    // A destroyed guest also invalidates the cached prefix: selecting the same
    // step again must recreate the browser and execute its actions from scratch.
    await app.evaluate(({ webContents }) => {
      webContents
        .getAllWebContents()
        .find((contents) => contents.getType() === 'webview')!
        .close();
    });
    await expect.poll(async () => (await snapshot(page)).stepReplay?.status).toBe('idle');
    await page.locator('ol > li > [role="button"]').nth(1).click();
    await expect
      .poll(async () => (await snapshot(page)).stepReplay)
      .toMatchObject({
        status: 'synced',
        appliedIndex: 1,
      });
    expect(
      await app.evaluate(async ({ webContents }) => {
        const target = webContents
          .getAllWebContents()
          .find((contents) => contents.getType() === 'webview')!;
        return target.executeJavaScript("document.querySelector('#email').value");
      }),
    ).toBe('reopened@example.com');
  } finally {
    await app.close();
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});
