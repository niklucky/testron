import { closeElectron } from './helpers/close-electron';
import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
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

test('saved browser state authenticates the first document and every replay reset', async () => {
  test.setTimeout(90_000);
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    if (request.url === '/login') {
      response.end('<h1>Login required</h1>');
      return;
    }
    if (!request.headers.cookie?.includes('session=saved-cookie')) {
      response.writeHead(302, { Location: '/login' });
      response.end();
      return;
    }
    response.end(`<script>
      window.initialToken = localStorage.getItem('auth-token');
      if (window.initialToken !== 'saved-token') location.replace('/login');
    </script><h1>Authenticated</h1><input id="name"><button id="logout" onclick="localStorage.removeItem('auth-token'); location.href='/protected'">Logout</button>`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture did not start');
  const origin = `http://127.0.0.1:${address.port}`;
  const url = `${origin}/protected`;
  const dataDirectory = mkdtempSync(path.join(tmpdir(), 'testron-auth-replay-'));
  const launch = () =>
    electron.launch({
      ...(process.env.TESTRON_ELECTRON_EXECUTABLE
        ? { executablePath: process.env.TESTRON_ELECTRON_EXECUTABLE, args: [] }
        : { args: ['.'] }),
      env: { ...process.env, TESTRON_DATA_DIR: dataDirectory, TESTRON_LOCAL_MODE: '1' },
    });
  let app = await launch();
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => {
      window.location.hash = '#/record';
    });
    await page.getByRole('button', { name: /^(Record|Continue recording)\s*R$/ }).waitFor();
    await page.evaluate(() =>
      window.testron.command({ type: 'create-project', name: 'Authenticated replay' }),
    );
    await expect.poll(async () => (await snapshot(page)).library.selectedProjectId).toBeTruthy();
    const projectId = (await snapshot(page)).library.selectedProjectId!;
    await page.evaluate(
      ({ projectId, url }) =>
        window.testron.command({
          type: 'create-environment',
          projectId,
          name: 'Protected',
          baseUrl: url,
          testIdAttribute: 'data-testid',
        }),
      { projectId, url },
    );
    await expect
      .poll(async () => (await snapshot(page)).library.selectedEnvironmentId)
      .toBeTruthy();
    const environmentId = (await snapshot(page)).library.selectedEnvironmentId!;
    await expect.poll(async () => (await snapshot(page)).currentUrl).toBe(`${origin}/login`);
    await page.evaluate(
      ({ environmentId, origin }) =>
        window.testron.command({
          type: 'create-profile',
          environmentId,
          name: 'Saved browser state',
          authenticationType: 'storage-state',
          variables: [
            {
              name: 'storageState',
              sensitive: true,
              value: JSON.stringify({
                cookies: [
                  {
                    name: 'session',
                    value: 'saved-cookie',
                    domain: '127.0.0.1',
                    path: '/',
                    expires: -1,
                    httpOnly: true,
                    secure: false,
                    sameSite: 'Lax',
                  },
                ],
                origins: [{ origin, localStorage: [{ name: 'auth-token', value: 'saved-token' }] }],
              }),
            },
          ],
        }),
      { environmentId, origin },
    );
    await expect.poll(async () => (await snapshot(page)).library.selectedProfileId).toBeTruthy();
    await page.evaluate(
      ({ projectId, environmentId }) =>
        window.testron.command({
          type: 'create-test',
          projectId,
          environmentIds: [environmentId],
          title: 'Authenticated replay',
        }),
      { projectId, environmentId },
    );
    const browser = () =>
      app.evaluate(async ({ webContents }) => {
        const target = webContents
          .getAllWebContents()
          .find((contents) => contents.getType() === 'webview');
        if (!target) return undefined;
        return {
          url: target.getURL(),
          ...(await target.executeJavaScript(
            `({ token: window.initialToken, value: document.querySelector('#name')?.value })`,
          )),
        };
      });
    await test.step('Open authenticated page', async () => {
      await expect
        .poll(browser, { timeout: 15_000 })
        .toEqual({ url, token: 'saved-token', value: '' });
    });
    await page.evaluate(
      (url) =>
        window.testron.command({
          type: 'update-source',
          source: `
      import { test } from '@playwright/test';
      test('Authenticated replay', async ({ page }) => {
        await page.goto(${JSON.stringify(url)});
        await page.locator('#name').fill('Ada');
        await page.locator('#logout').click();
      });
    `,
        }),
      url,
    );
    await expect.poll(async () => (await snapshot(page)).steps.length).toBe(3);
    const select = async (index: number) => {
      await page.locator('ol > li > [role="button"]').nth(index).click();
      await expect
        .poll(async () => (await snapshot(page)).stepReplay, { timeout: 15_000 })
        .toMatchObject({ status: 'synced', appliedIndex: index });
    };
    await select(1);
    expect(await browser()).toEqual({ url, token: 'saved-token', value: 'Ada' });
    await select(0);
    expect(await browser()).toEqual({ url, token: 'saved-token', value: '' });
    await select(2);
    // Authentication is a baseline, not an effect reapplied after every action.
    await expect.poll(async () => (await browser())?.url).toBe(`${origin}/login`);
    await select(1);
    expect(await browser()).toEqual({ url, token: 'saved-token', value: 'Ada' });

    // A fresh process has an empty in-memory browser partition. Opening the
    // saved test must restore its profile before its very first page script.
    await test.step('Close the first app session', () => closeElectron(app));
    app = await test.step('Launch a fresh app session', launch);
    const reopened = await app.firstWindow();
    await reopened.waitForLoadState('domcontentloaded');
    await reopened.evaluate(() => {
      window.location.hash = '#/record';
    });
    await test.step('Open authenticated page', async () => {
      await expect
        .poll(browser, { timeout: 15_000 })
        .toEqual({ url, token: 'saved-token', value: '' });
    });
  } finally {
    await closeElectron(app);
    rmSync(dataDirectory, { recursive: true, force: true });
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
