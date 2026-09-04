import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { AppSnapshot } from '../../src/preload/api';

/**
 * The tested site is an isolated webview in the record renderer. Panels are
 * opaque DOM siblings, so opening one must resize the webview without adding a
 * native child surface above the toolbar.
 */
const openRecordScreen = async () => {
  const dataDirectory = mkdtempSync(path.join(tmpdir(), 'testron-panels-'));
  const electronApp = await electron.launch({
    args: ['.'],
    env: { ...process.env, TESTRON_DATA_DIR: dataDirectory, TESTRON_LOCAL_MODE: '1' },
  });
  const appWindow = await electronApp.firstWindow();
  await appWindow.evaluate(() => {
    window.location.hash = '#/record';
  });
  await appWindow
    .getByRole('button', { name: /^(Record|Continue recording)\s*R$/ })
    .waitFor({ timeout: 10_000 });
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

  return { electronApp, appWindow, dataDirectory };
};

/** Native child views. The recorder must have none; only the product uses one. */
const childBounds = (electronApp: Awaited<ReturnType<typeof electron.launch>>) =>
  electronApp.evaluate(({ BrowserWindow }) => {
    const root = BrowserWindow.getAllWindows()[0].contentView;
    return root.children.map((child) => child.getBounds());
  });

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

test('remote product opens the local recorder and fully reclaims the window', async () => {
  test.setTimeout(60_000);
  const dataDirectory = mkdtempSync(path.join(tmpdir(), 'testron-remote-view-'));
  const electronApp = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      TESTRON_DATA_DIR: dataDirectory,
      TESTRON_LOCAL_MODE: '0',
      TESTRON_WEBAPP_URL: 'http://127.0.0.1:4174/',
    },
  });
  try {
    const appWindow = await electronApp.firstWindow();
    const openFromRemote = (route: 'record') =>
      electronApp.evaluate(async ({ BrowserWindow, webContents }, nextRoute) => {
        const mainContents = BrowserWindow.getAllWindows()[0].webContents;
        const remote = webContents
          .getAllWebContents()
          .find(
            (contents) =>
              contents !== mainContents && contents.getURL() === 'http://127.0.0.1:4174/',
          );
        if (!remote) throw new Error('Remote product WebContentsView was not found.');
        await remote.executeJavaScript(
          `window.testronDesktop.openLocal(${JSON.stringify({ route: nextRoute })})`,
        );
      }, route);
    const setRemoteLocale = (locale: 'en' | 'ru') =>
      electronApp.evaluate(async ({ BrowserWindow, webContents }, nextLocale) => {
        const mainContents = BrowserWindow.getAllWindows()[0].webContents;
        const remote = webContents
          .getAllWebContents()
          .find(
            (contents) =>
              contents !== mainContents && contents.getURL() === 'http://127.0.0.1:4174/',
          );
        if (!remote) throw new Error('Remote product WebContentsView was not found.');
        await remote.executeJavaScript(
          `window.testronDesktop.setLocale(${JSON.stringify(nextLocale)})`,
        );
      }, locale);

    await expect
      .poll(() =>
        electronApp.evaluate(({ webContents }) =>
          webContents
            .getAllWebContents()
            .some((contents) => contents.getURL() === 'http://127.0.0.1:4174/'),
        ),
      )
      .toBe(true);

    await setRemoteLocale('en');
    await openFromRemote('record');
    await appWindow
      .getByRole('button', { name: /^(Record|Continue recording)\s*R$/ })
      .waitFor({ timeout: 10_000 });
    await expect.poll(() => childBounds(electronApp)).toEqual([]);

    await appWindow.evaluate(() => window.testron.command({ type: 'show-product' }));
    await expect.poll(async () => (await childBounds(electronApp))[0]?.width).toBeGreaterThan(0);
    await expect
      .poll(() =>
        electronApp.evaluate(
          ({ webContents }) =>
            webContents
              .getAllWebContents()
              .filter((contents) => contents.getURL() === 'http://127.0.0.1:4174/').length,
        ),
      )
      .toBe(1);
  } finally {
    await closeElectron(electronApp);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('recorder header controls stay above the tested website view', async () => {
  test.setTimeout(60_000);
  const { electronApp, appWindow, dataDirectory } = await openRecordScreen();
  try {
    await test.step('session menus leave the tested website visible', async () => {
      for (const label of ['Recording test suite']) {
        await appWindow.getByRole('button', { name: label }).click();
        await expect(appWindow.locator('webview')).toBeVisible();
        await expect.poll(() => childBounds(electronApp)).toEqual([]);
        await appWindow.keyboard.press('Escape');
      }
    });

    await test.step('edit title', async () => {
      await appWindow.getByRole('button', { name: /Untitled test|recorded test/ }).click();
      await expect(appWindow.getByRole('dialog', { name: 'Edit test title' })).toBeVisible();
      await expect(appWindow.locator('webview')).toBeVisible();
      await appWindow.getByRole('button', { name: 'Cancel' }).click();
    });

    await test.step('edit profile', async () => {
      await appWindow.getByLabel('Create authentication profile').click();
      await expect(appWindow.getByRole('dialog', { name: 'Authentication profile' })).toBeVisible();
      await expect(appWindow.locator('webview')).toBeVisible();
      await appWindow.getByRole('button', { name: 'Cancel' }).click();
    });
  } finally {
    await closeElectron(electronApp);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('starting a new test resets only the tested website session', async () => {
  test.setTimeout(60_000);
  const { electronApp, appWindow, dataDirectory } = await openRecordScreen();
  try {
    const usesDefaultSession = await electronApp.evaluate(
      async ({ BrowserWindow, session, webContents }) => {
        const mainContents = BrowserWindow.getAllWindows()[0].webContents;
        const target = webContents
          .getAllWebContents()
          .find(
            (contents) =>
              contents !== mainContents && contents.getURL() === 'http://127.0.0.1:4174/',
          );
        if (!target) throw new Error('Tested website webContents was not found.');

        await session.defaultSession.cookies.set({
          url: 'http://127.0.0.1:4174/',
          name: 'testron-product-session',
          value: 'keep',
        });
        await target.executeJavaScript(`
          localStorage.setItem('login-state', 'authenticated');
          sessionStorage.setItem('login-state', 'authenticated');
          document.cookie = 'target-session=authenticated; path=/';
        `);
        return target.session === session.defaultSession;
      },
    );
    expect(usesDefaultSession).toBe(false);

    await appWindow.evaluate(() =>
      window.testron.command({ type: 'prepare-new-test', title: 'Failed login' }),
    );

    await expect
      .poll(() =>
        electronApp.evaluate(async ({ BrowserWindow, webContents }) => {
          const mainContents = BrowserWindow.getAllWindows()[0].webContents;
          const target = webContents
            .getAllWebContents()
            .find(
              (contents) =>
                contents !== mainContents && contents.getURL() === 'http://127.0.0.1:4174/',
            );
          if (!target || target.isLoading()) return null;
          try {
            return await target.executeJavaScript(
              `[localStorage.getItem('login-state'), sessionStorage.getItem('login-state'), document.cookie]`,
            );
          } catch {
            return null;
          }
        }),
      )
      .toEqual([null, null, '']);

    const productCookies = await electronApp.evaluate(({ session }) =>
      session.defaultSession.cookies.get({
        url: 'http://127.0.0.1:4174/',
        name: 'testron-product-session',
      }),
    );
    expect(productCookies).toHaveLength(1);
  } finally {
    await closeElectron(electronApp);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('test steps switch between tester summaries and developer locators', async () => {
  const { electronApp, appWindow, dataDirectory } = await openRecordScreen();
  try {
    await appWindow.evaluate(() =>
      window.testron.command({
        type: 'replace-steps',
        steps: [
          {
            version: 1,
            kind: 'click',
            target: {
              primary: { strategy: 'role', role: 'textbox', name: 'Work email' },
              alternatives: [{ strategy: 'testId', attribute: 'data-testid', value: 'email' }],
            },
            metadata: { recordedAt: '2026-08-22T10:00:00.000Z' },
          },
        ],
      }),
    );

    const stepsPanel = appWindow.getByRole('complementary', { name: 'Test steps' });
    const summary = stepsPanel.getByText('Click “Work email”', { exact: true });
    await expect(summary).toBeVisible();
    const locatorButton = stepsPanel.locator('button[aria-expanded]').filter({
      hasText: "getByRole('textbox', { name: 'Work email' })",
    });
    await expect(locatorButton).toHaveCount(0);

    await stepsPanel.getByRole('button', { name: 'Developer', exact: true }).click();
    await expect(locatorButton).toBeVisible();

    await stepsPanel.getByRole('button', { name: 'Tester', exact: true }).click();
    await expect(locatorButton).toHaveCount(0);
    const testerRow = summary.locator('xpath=ancestor::*[@role="button"][1]');
    const details = testerRow.getByRole('tooltip');
    await expect(details).toBeHidden();
    await testerRow.hover();
    await expect(details).toContainText("getByRole('textbox', { name: 'Work email' })");
    await expect(details).toContainText("getByTestId('email')");
    await expect(details).toBeVisible();
  } finally {
    await closeElectron(electronApp);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('profile variables auto-fill exact field names and record only references', async () => {
  const { electronApp, appWindow, dataDirectory } = await openRecordScreen();
  try {
    appWindow.evaluate(() => window.testron.command({ type: 'create-project', name: 'Analytics' }));
    await expect.poll(async () => (await appSnapshot(appWindow)).library.projects.length).toBe(1);
    const projectId = (await appSnapshot(appWindow)).library.selectedProjectId!;
    appWindow.evaluate(
      (id) =>
        window.testron.command({
          type: 'create-environment',
          projectId: id,
          name: 'Development',
          baseUrl: 'http://127.0.0.1:4174/',
          testIdAttribute: 'data-testid',
        }),
      projectId,
    );
    await expect
      .poll(async () => (await appSnapshot(appWindow)).library.environments.length)
      .toBe(1);

    await appWindow.getByLabel('Create authentication profile').click();
    await appWindow.getByLabel('Variable 1 value').fill('Administrator');
    await appWindow.getByLabel('Variable 2 value').fill('hardcoded-for-test');
    await appWindow.getByRole('button', { name: 'Create and select' }).click();
    await expect.poll(async () => (await appSnapshot(appWindow)).library.profiles.length).toBe(1);

    await test.step('selected profile menu and both edit buttons remain interactive', async () => {
      const hitRegions = await appWindow.evaluate(() => {
        const controls = [
          document.querySelector<HTMLElement>('[aria-label="Recording profile"]'),
          document.querySelector<HTMLElement>('[aria-label="Configure Administrator"]'),
          [...document.querySelectorAll<HTMLElement>('header button')].find(
            (button) => button.textContent?.trim() === 'recorded test',
          ),
        ];
        return controls.map((control) =>
          control ? getComputedStyle(control).getPropertyValue('-webkit-app-region') : undefined,
        );
      });
      expect(hitRegions).toEqual(['no-drag', 'no-drag', 'no-drag']);

      await appWindow.getByRole('button', { name: 'Recording profile' }).click({ timeout: 5_000 });
      await expect(appWindow.getByRole('listbox', { name: 'Recording profile' })).toBeVisible();
      await expect(appWindow.getByRole('option', { name: 'No profile' })).toBeVisible();
      await expect(appWindow.getByRole('option', { name: 'Administrator' })).toBeVisible();
      await expect.poll(() => childBounds(electronApp)).toEqual([]);
      await appWindow.getByRole('option', { name: 'No profile' }).click({ timeout: 5_000 });
      await expect
        .poll(async () => (await appSnapshot(appWindow)).library.selectedProfileId)
        .toBeUndefined();
      await appWindow.getByRole('button', { name: 'Recording profile' }).click({ timeout: 5_000 });
      await appWindow.getByRole('option', { name: 'Administrator' }).click({ timeout: 5_000 });
      await expect
        .poll(async () => (await appSnapshot(appWindow)).library.selectedProfileId)
        .toBe((await appSnapshot(appWindow)).library.profiles[0]?.id);

      await appWindow.getByLabel('Configure Administrator').click({ timeout: 5_000 });
      await expect(appWindow.getByRole('dialog', { name: 'Authentication profile' })).toBeVisible();
      await appWindow.getByRole('button', { name: 'Cancel' }).click();

      await appWindow.getByRole('button', { name: 'recorded test' }).click({ timeout: 5_000 });
      await expect(appWindow.getByRole('dialog', { name: 'Edit test title' })).toBeVisible();
      await appWindow.getByRole('button', { name: 'Cancel' }).click();
    });

    await appWindow.getByRole('button', { name: /^Record ?R$/ }).click();
    const resolvedValue = await electronApp.evaluate(async ({ webContents }) => {
      const website = webContents
        .getAllWebContents()
        .find((contents) => contents.getURL() === 'http://127.0.0.1:4174/');
      if (!website) throw new Error('Fixture WebContentsView was not found.');
      return website.executeJavaScript(`(() => {
        const input = document.querySelector('[data-testid="email"]');
        input.setAttribute('name', 'username');
        input.focus();
        const value = input.value;
        input.blur();
        return value;
      })()`);
    });
    expect(resolvedValue).toBe('Administrator');

    await expect
      .poll(async () => (await appSnapshot(appWindow)).steps.find((step) => step.kind === 'fill'))
      .toMatchObject({ kind: 'fill', value: '', variable: { name: 'username' } });
    expect(JSON.stringify((await appSnapshot(appWindow)).steps)).not.toContain('Administrator');
  } finally {
    await closeElectron(electronApp);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('header, cookie, and saved storage-state profiles are applied while recording', async () => {
  test.setTimeout(60_000);
  const { electronApp, appWindow, dataDirectory } = await openRecordScreen();
  const crossOriginHeaders: Array<string | undefined> = [];
  const crossOriginServer = createServer((request, response) => {
    crossOriginHeaders.push(request.headers['x-testron-profile'] as string | undefined);
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<p>Cross origin</p>');
  });
  await new Promise<void>((resolve) => crossOriginServer.listen(0, '127.0.0.1', resolve));
  const crossOriginAddress = crossOriginServer.address();
  if (!crossOriginAddress || typeof crossOriginAddress === 'string')
    throw new Error('Cross-origin fixture server did not start.');
  const crossOriginUrl = `http://127.0.0.1:${crossOriginAddress.port}/pixel.png`;
  try {
    appWindow.evaluate(() => window.testron.command({ type: 'create-project', name: 'API' }));
    await expect.poll(async () => (await appSnapshot(appWindow)).library.projects.length).toBe(1);
    const projectId = (await appSnapshot(appWindow)).library.selectedProjectId!;
    appWindow.evaluate(
      (id) =>
        window.testron.command({
          type: 'create-environment',
          projectId: id,
          name: 'Development',
          baseUrl: 'http://127.0.0.1:4174/',
          testIdAttribute: 'data-testid',
        }),
      projectId,
    );
    await expect
      .poll(async () => (await appSnapshot(appWindow)).library.environments.length)
      .toBe(1);
    const environmentId = (await appSnapshot(appWindow)).library.selectedEnvironmentId!;

    await appWindow.getByLabel('Create authentication profile').click();
    await appWindow.getByLabel('Authentication type').selectOption('headers');
    await appWindow.getByLabel('Variable 1 name').fill('X-Testron-Profile');
    await appWindow.getByLabel('Variable 1 value').fill('header-secret');
    await appWindow.getByRole('button', { name: 'Create and select' }).click();
    await expect.poll(async () => (await appSnapshot(appWindow)).library.profiles.length).toBe(1);

    const requestEvidence = async (suffix: string) => {
      const targetUrl = `http://127.0.0.1:4174/request-profile?${suffix}`;
      await appWindow.evaluate(
        (url) => window.testron.command({ type: 'navigate', url }),
        targetUrl,
      );
      return expect
        .poll(() =>
          electronApp.evaluate(({ webContents }, expectedUrl) => {
            const website = webContents
              .getAllWebContents()
              .find((contents) => contents.getURL() === expectedUrl);
            return website?.executeJavaScript(
              `document.querySelector('[data-testid="profile-request"]')?.textContent`,
            );
          }, targetUrl),
        )
        .toBeDefined();
    };

    await requestEvidence(`headers&subresource=${encodeURIComponent(crossOriginUrl)}`);
    await expect
      .poll(() =>
        electronApp.evaluate(async ({ webContents }) => {
          const website = webContents
            .getAllWebContents()
            .find((contents) => contents.getURL().includes('/request-profile'));
          return website?.executeJavaScript(
            `document.querySelector('[data-testid="profile-request"]')?.textContent`,
          );
        }),
      )
      .toBe('header-secret|');
    await expect.poll(() => crossOriginHeaders).toEqual([undefined]);
    await appWindow.evaluate(
      (url) => window.testron.command({ type: 'navigate', url }),
      `http://127.0.0.1:4174/request-profile-redirect?target=${encodeURIComponent(crossOriginUrl)}`,
    );
    await expect.poll(() => crossOriginHeaders).toEqual([undefined, undefined]);

    appWindow.evaluate(
      ({ id }) =>
        window.testron.command({
          type: 'create-profile',
          environmentId: id,
          name: 'Session',
          authenticationType: 'cookies',
          variables: [{ name: 'sid', value: 'cookie-secret', sensitive: true }],
        }),
      { id: environmentId },
    );
    await expect.poll(async () => (await appSnapshot(appWindow)).library.profiles.length).toBe(2);
    await expect
      .poll(() =>
        electronApp.evaluate(async ({ webContents }) => {
          const website = webContents
            .getAllWebContents()
            .find((contents) => contents.getURL().includes('/request-profile'));
          return website?.session.cookies.get({
            url: 'http://127.0.0.1:4174/',
            name: 'sid',
          });
        }),
      )
      .toHaveLength(1);
    await requestEvidence('cookies');
    await expect
      .poll(() =>
        electronApp.evaluate(async ({ webContents }) => {
          const website = webContents
            .getAllWebContents()
            .find((contents) => contents.getURL().includes('/request-profile'));
          return website?.executeJavaScript(
            `document.querySelector('[data-testid="profile-request"]')?.textContent`,
          );
        }),
      )
      .toBe('|sid=cookie-secret');

    appWindow.evaluate(
      ({ id }) =>
        window.testron.command({
          type: 'create-profile',
          environmentId: id,
          name: 'Saved session',
          authenticationType: 'storage-state',
          variables: [
            {
              name: 'storageState',
              sensitive: true,
              value: JSON.stringify({
                cookies: [
                  {
                    name: 'saved_sid',
                    value: 'saved-cookie',
                    domain: '127.0.0.1',
                    path: '/',
                    expires: -1,
                    httpOnly: false,
                    secure: false,
                    sameSite: 'Lax',
                  },
                ],
                origins: [
                  {
                    origin: 'http://127.0.0.1:4174',
                    localStorage: [{ name: 'accessToken', value: 'saved-local-token' }],
                  },
                ],
              }),
            },
          ],
        }),
      { id: environmentId },
    );
    await expect.poll(async () => (await appSnapshot(appWindow)).library.profiles.length).toBe(3);
    await expect
      .poll(() =>
        electronApp.evaluate(async ({ webContents }) => {
          const website = webContents
            .getAllWebContents()
            .find((contents) => contents.getURL().includes('/request-profile'));
          if (!website) return undefined;
          const [cookies, localValue] = await Promise.all([
            website.session.cookies.get({
              url: 'http://127.0.0.1:4174/',
              name: 'saved_sid',
            }),
            website.executeJavaScript(`localStorage.getItem('accessToken')`),
          ]);
          return { cookie: cookies[0]?.value, localValue };
        }),
      )
      .toEqual({ cookie: 'saved-cookie', localValue: 'saved-local-token' });

    const snapshot = await appSnapshot(appWindow);
    const headerProfileId = snapshot.library.profiles.find(
      (profile) => profile.name === 'Administrator',
    )!.id;
    const storageProfileId = snapshot.library.profiles.find(
      (profile) => profile.name === 'Saved session',
    )!.id;
    appWindow.evaluate(
      ({ projectId: selectedProjectId, environmentId: selectedEnvironmentId }) =>
        window.testron.command({
          type: 'create-test',
          projectId: selectedProjectId,
          environmentIds: [selectedEnvironmentId],
          title: 'authenticated request',
        }),
      { projectId, environmentId },
    );
    await expect.poll(async () => (await appSnapshot(appWindow)).library.tests.length).toBe(1);
    const testId = (await appSnapshot(appWindow)).library.selectedTestId!;
    appWindow.evaluate(
      (profileId) => window.testron.command({ type: 'select-profile', profileId }),
      headerProfileId,
    );
    await expect
      .poll(async () => (await appSnapshot(appWindow)).library.selectedProfileId)
      .toBe(headerProfileId);
    appWindow.evaluate(
      ({ projectId: selectedProjectId, environmentId: selectedEnvironmentId }) =>
        window.testron.command({
          type: 'create-test',
          projectId: selectedProjectId,
          environmentIds: [selectedEnvironmentId],
          title: 'another authenticated request',
        }),
      { projectId, environmentId },
    );
    await expect.poll(async () => (await appSnapshot(appWindow)).library.tests.length).toBe(2);
    appWindow.evaluate(
      ({ selectedTestId, profileId }) => {
        window.testron.command({ type: 'select-profile', profileId });
        window.testron.command({ type: 'select-test', testId: selectedTestId });
      },
      { selectedTestId: testId, profileId: storageProfileId },
    );
    await expect
      .poll(async () => (await appSnapshot(appWindow)).library.selectedProfileId)
      .toBe(headerProfileId);
  } finally {
    await closeElectron(electronApp);
    rmSync(dataDirectory, { recursive: true, force: true });
    await new Promise<void>((resolve, reject) =>
      crossOriginServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('records a table row collection count with its current match total', async () => {
  const { electronApp, appWindow, dataDirectory } = await openRecordScreen();
  try {
    await appWindow.getByRole('button', { name: /^Record ?R$/ }).click();
    await appWindow.getByRole('button', { name: 'Assert' }).click();

    const websiteEval = (source: string) =>
      electronApp.evaluate(async ({ webContents }, script) => {
        const website = webContents
          .getAllWebContents()
          .find((contents) => contents.getURL() === 'http://127.0.0.1:4174/');
        if (!website) throw new Error('Fixture WebContentsView was not found.');
        return website.executeJavaScript(script);
      }, source);
    await websiteEval(`(() => {
      document.body.innerHTML = '<table><thead><tr><th>Name</th></tr></thead><tbody>' +
        Array.from({ length: 20 }, (_, index) => '<tr><td>Row ' + (index + 1) + '</td></tr>').join('') +
        '</tbody></table>';
      const cell = document.querySelector('tbody td');
      const rect = cell.getBoundingClientRect();
      cell.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        clientX: rect.left + 2,
        clientY: rect.top + 2,
      }));
      cell.click();
    })()`);
    await expect
      .poll(() =>
        websiteEval(
          `document.querySelector('[aria-label="Assertion near selected element"]')?.value`,
        ),
      )
      .toBe('visible');
    await websiteEval(`(() => {
      const select = document.querySelector('[aria-label="Assertion near selected element"]');
      select.value = 'countExactly';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await expect
      .poll(() =>
        websiteEval(`document.querySelector('[aria-label="Choose locator"]')?.textContent`),
      )
      .toContain('20 matches');
    await websiteEval(`document.querySelector('[aria-label="Confirm assertion"]').click()`);

    await expect
      .poll(async () =>
        (await appSnapshot(appWindow)).steps.find((step) => step.kind === 'assertElement'),
      )
      .toMatchObject({
        target: { primary: { strategy: 'css', selector: 'table > tbody > tr' } },
        assertion: { type: 'count', operator: 'equals', expected: 20 },
      });
  } finally {
    await closeElectron(electronApp);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

// TestView is hosted by the webapp now; this scenario belongs in its browser suite.
test.skip('failed assertions show their error and repeated runs append cards', async () => {
  const { electronApp, appWindow, dataDirectory } = await openRecordScreen();
  try {
    appWindow.evaluate(() => window.testron.command({ type: 'create-project', name: 'Failures' }));
    await expect.poll(async () => (await appSnapshot(appWindow)).library.projects.length).toBe(1);
    const projectId = (await appSnapshot(appWindow)).library.selectedProjectId!;
    appWindow.evaluate(
      (id) =>
        window.testron.command({
          type: 'create-environment',
          projectId: id,
          name: 'Local',
          baseUrl: 'http://127.0.0.1:4174/',
          testIdAttribute: 'data-testid',
        }),
      projectId,
    );
    await expect
      .poll(async () => (await appSnapshot(appWindow)).library.selectedEnvironmentId)
      .toBeTruthy();
    const environmentId = (await appSnapshot(appWindow)).library.selectedEnvironmentId!;
    appWindow.evaluate(
      ({ projectId, environmentId }) => {
        window.testron.command({
          type: 'create-test',
          projectId,
          environmentIds: [environmentId],
          title: 'visible heading fails hidden assertion',
        });
      },
      { projectId, environmentId },
    );
    await expect
      .poll(async () => (await appSnapshot(appWindow)).library.selectedTestId)
      .toBeTruthy();
    await appWindow.evaluate(() => {
      const firstAt = '2026-08-17T01:00:00.000Z';
      window.testron.command({
        type: 'replace-steps',
        steps: [
          {
            version: 1,
            kind: 'navigate',
            url: 'http://127.0.0.1:4174/',
            metadata: { recordedAt: firstAt },
          },
          {
            version: 1,
            kind: 'assertElement',
            target: {
              primary: { strategy: 'role', role: 'heading', name: 'Welcome back' },
              alternatives: [],
            },
            assertion: { type: 'hidden' },
            metadata: { recordedAt: '2026-08-17T01:00:01.000Z' },
          },
        ],
      });
      window.location.hash = '#/test';
    });

    const run = () =>
      appWindow.evaluate(() =>
        window.testron.command({
          type: 'run-test',
          environmentVariables: {},
          timeoutMs: 1_000,
          authStateMode: 'ignore',
        }),
      );
    await run();
    await expect.poll(async () => (await appSnapshot(appWindow)).replay.status).toBe('timedOut');
    await expect(appWindow.getByText('Assertion failed')).toBeVisible();
    await expect(appWindow.getByLabel('Assertion error')).not.toHaveText('');

    await run();
    await expect.poll(async () => (await appSnapshot(appWindow)).replayHistory.length).toBe(2);
    await expect(appWindow.getByText('Failed', { exact: true })).toHaveCount(2);

    await appWindow.getByRole('button', { name: 'View source' }).click();
    const modal = appWindow.getByRole('dialog', { name: 'Auto test source' });
    await expect(modal).toBeVisible();
    const modalBox = await modal.boundingBox();
    const narrowViewport = await appWindow.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    expect(modalBox!.width).toBeGreaterThan(narrowViewport.width * 0.9);
    expect(modalBox!.height).toBeGreaterThan(narrowViewport.height * 0.75);
    await modal.getByLabel('Close').click();

    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setContentSize(2100, 900);
    });
    if ((await appWindow.evaluate(() => window.innerWidth)) > 1920) {
      await appWindow.getByRole('button', { name: 'View source' }).click();
      const dockedSource = appWindow.getByRole('complementary', { name: 'Auto test source' });
      await expect(dockedSource).toBeVisible();
      await expect(appWindow.getByRole('dialog', { name: 'Auto test source' })).toHaveCount(0);
      const [boardBox, sourceBox] = await Promise.all([
        appWindow.getByTestId('test-board').boundingBox(),
        dockedSource.boundingBox(),
      ]);
      expect(Math.abs(boardBox!.width - sourceBox!.width)).toBeLessThanOrEqual(2);
    }
  } finally {
    await closeElectron(electronApp);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

// TestView is hosted by the webapp now; this scenario belongs in its browser suite.
test.skip('test steps scroll without source and locators can be repaired inline', async () => {
  const { electronApp, appWindow, dataDirectory } = await openRecordScreen();
  try {
    appWindow.evaluate(() => window.testron.command({ type: 'create-project', name: 'Editing' }));
    await expect.poll(async () => (await appSnapshot(appWindow)).library.projects.length).toBe(1);
    const projectId = (await appSnapshot(appWindow)).library.selectedProjectId!;
    appWindow.evaluate(
      (id) =>
        window.testron.command({
          type: 'create-environment',
          projectId: id,
          name: 'Local',
          baseUrl: 'http://127.0.0.1:4174/welcome',
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
          environmentIds: [environmentId],
          title: 'Editable menu',
        }),
      { projectId, environmentId },
    );
    await expect
      .poll(async () => (await appSnapshot(appWindow)).library.selectedTestId)
      .toBeTruthy();
    await appWindow.evaluate(() => {
      window.testron.command({
        type: 'replace-steps',
        steps: Array.from({ length: 30 }, (_, index) => ({
          version: 1 as const,
          kind: 'click' as const,
          target: {
            primary: {
              strategy: 'css' as const,
              selector: `div > div > button:nth-child(${index + 1})`,
              fragile: true as const,
            },
            alternatives:
              index === 0
                ? [{ strategy: 'role' as const, role: 'menuitem', name: 'Dashboard' }]
                : [],
          },
          metadata: { recordedAt: new Date(Date.UTC(2026, 7, 17, 2, 0, index)).toISOString() },
        })),
      });
      window.location.hash = '#/test';
    });

    const lane = appWindow.getByTestId('steps-lane-scroll');
    await expect(lane).toBeVisible();
    expect(
      await lane.evaluate((element) => ({
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        overflowY: getComputedStyle(element).overflowY,
      })),
    ).toMatchObject({ overflowY: 'auto' });
    expect(await lane.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
      true,
    );

    const firstSummary = lane.getByText('Click “div > div > button:nth-child(1)”', { exact: true });
    await expect(firstSummary).toBeVisible();
    await expect(appWindow.getByLabel('Step 1 locator — click to edit')).toHaveCount(0);
    const firstCard = firstSummary.locator(
      'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " group/step ")][1]',
    );
    const testerDetails = firstCard.getByRole('tooltip');
    await expect(testerDetails).toBeHidden();
    await firstCard.hover();
    await expect(testerDetails).toContainText("locator('div > div > button:nth-child(1)')");
    await expect(testerDetails).toContainText("getByRole('menuitem', { name: 'Dashboard' })");
    await expect(testerDetails).toBeVisible();

    await appWindow
      .getByRole('group', { name: 'Step view' })
      .getByRole('button', { name: 'Developer', exact: true })
      .click();
    await appWindow.getByLabel('Step 1 locator — click to edit').click();
    const locatorInput = appWindow.getByLabel('Step 1 locator');
    await locatorInput.fill("getByRole('menuitem', { name: 'Dashboard' })");
    await locatorInput.press('Enter');
    await expect
      .poll(async () => {
        const step = (await appSnapshot(appWindow)).steps[0];
        return step && 'target' in step ? step.target.primary : undefined;
      })
      .toEqual({ strategy: 'role', role: 'menuitem', name: 'Dashboard' });
    await expect(appWindow.getByText('Click “Dashboard”', { exact: true })).toBeVisible();

    await appWindow.evaluate(() => {
      const observed = [] as string[];
      (window as typeof window & { observedRecordSources?: string[] }).observedRecordSources =
        observed;
      new MutationObserver(() => {
        const source = document.querySelector('webview')?.getAttribute('src');
        if (source) observed.push(source);
      }).observe(document.body, { childList: true, subtree: true, attributes: true });
    });
    await appWindow.getByLabel('Repick element for step 1', { exact: true }).click();
    await appWindow.getByRole('button', { name: /^(Continue recording|Record) ?R$/ }).waitFor();
    await expect
      .poll(() => appWindow.locator('webview').getAttribute('src'))
      .toBe('http://127.0.0.1:4174/welcome');
    const observedSources = await appWindow.evaluate(
      () =>
        (window as typeof window & { observedRecordSources?: string[] }).observedRecordSources ??
        [],
    );
    expect(observedSources.length).toBeGreaterThan(0);
    expect(observedSources.every((source) => source === 'http://127.0.0.1:4174/welcome')).toBe(
      true,
    );
    await expect
      .poll(() =>
        electronApp.evaluate(({ webContents }) =>
          webContents
            .getAllWebContents()
            .some((contents) => contents.getURL() === 'http://127.0.0.1:4174/welcome'),
        ),
      )
      .toBe(true);
    const repickWebsiteEval = (source: string) =>
      electronApp.evaluate(async ({ webContents }, script) => {
        const website = webContents
          .getAllWebContents()
          .find((contents) => contents.getURL() === 'http://127.0.0.1:4174/welcome');
        if (!website) throw new Error('Fixture WebContentsView was not found.');
        return website.executeJavaScript(script);
      }, source);
    await repickWebsiteEval(`(() => {
      document.body.innerHTML = '<button data-testid="real-dashboard">Real dashboard</button>';
      const button = document.querySelector('button');
      const rect = button.getBoundingClientRect();
      button.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        clientX: rect.left + 2,
        clientY: rect.top + 2,
      }));
    })()`);
    await expect
      .poll(() =>
        repickWebsiteEval(`document.querySelector('[aria-label="Choose locator"]')?.textContent`),
      )
      .toContain('Repick element');
    await repickWebsiteEval(`document.querySelector('[data-testid="real-dashboard"]').click()`);
    await expect
      .poll(async () => {
        const current = await appSnapshot(appWindow);
        const step = current.steps[0];
        return {
          repickIndex: current.repickIndex,
          primary: step && 'target' in step ? step.target.primary : undefined,
        };
      })
      .toEqual({
        repickIndex: undefined,
        primary: { strategy: 'testId', attribute: 'data-testid', value: 'real-dashboard' },
      });
  } finally {
    await closeElectron(electronApp);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('the panels are DOM siblings docked beside the embedded page', async () => {
  const { electronApp, appWindow, dataDirectory } = await openRecordScreen();
  try {
    const [plane, website, steps, code] = await Promise.all([
      appWindow.locator('[data-plane]').boundingBox(),
      appWindow.locator('webview').boundingBox(),
      appWindow.getByRole('complementary', { name: 'Test steps' }).boundingBox(),
      appWindow.getByRole('complementary', { name: 'Auto test' }).boundingBox(),
    ]);
    const panelWidth = plane!.width * 0.25;
    expect(steps!.x).toBeCloseTo(plane!.x, 0);
    expect(steps!.y).toBeCloseTo(plane!.y, 0);
    expect(steps!.width).toBeCloseTo(panelWidth, 0);
    expect(code!.x).toBeCloseTo(plane!.x + plane!.width - panelWidth, 0);
    expect(code!.width).toBeCloseTo(panelWidth, 0);
    expect(website!.x).toBeCloseTo(plane!.x + panelWidth, 0);
    expect(website!.width).toBeCloseTo(plane!.width - panelWidth * 2, 0);
    await expect.poll(() => childBounds(electronApp)).toEqual([]);
  } finally {
    await closeElectron(electronApp);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('panel blocks are opaque over the tested website', async () => {
  const { electronApp, appWindow, dataDirectory } = await openRecordScreen();
  try {
    const backgrounds = await appWindow
      .getByRole('complementary')
      .evaluateAll((panels) => panels.map((panel) => getComputedStyle(panel).backgroundColor));
    expect(backgrounds).toEqual(['rgb(20, 24, 27)', 'rgb(20, 24, 27)']);
  } finally {
    await closeElectron(electronApp);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('hover inspector targets deep HTML and SVG content and re-hits after scrolling', async () => {
  const { electronApp, appWindow, dataDirectory } = await openRecordScreen();
  try {
    await appWindow.getByRole('button', { name: /^Record ?R$/ }).click();
    await appWindow.getByRole('button', { name: /^Hover/ }).click();
    const websiteEval = (source: string) =>
      electronApp.evaluate(async ({ webContents }, script) => {
        const website = webContents
          .getAllWebContents()
          .find((contents) => contents.getURL() === 'http://127.0.0.1:4174/');
        if (!website) throw new Error('Fixture WebContentsView was not found.');
        return website.executeJavaScript(script);
      }, source);

    await websiteEval(`(() => {
        document.body.style.cssText = 'margin:0;display:block;min-height:1500px';
        document.body.innerHTML = [
          '<div id="root" style="position:relative;width:100vw;height:1500px">',
          '<span data-probe="first" style="position:absolute;left:10px;top:100px;width:calc(100vw - 20px);height:500px">Card text</span>',
          '<svg data-probe="second" style="position:absolute;left:10px;top:700px;width:200px;height:80px">',
          '<circle cx="20" cy="20" r="20"></circle>',
          '</svg>',
          '</div>',
        ].join('');
        window.scrollTo(0, 0);
      })()`);

    const inspectFirst = `(() => {
        const first = document.elementFromPoint(30, 120);
        first.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 30, clientY: 120 }));
        const panel = document.querySelector('[aria-label="Selector targeting hint"]');
        const panelRect = panel?.getBoundingClientRect();
        return {
          hit: first?.tagName?.toLowerCase(),
          inspector: panel?.outerHTML,
          position: panelRect ? { left: panelRect.left, top: panelRect.top } : undefined,
        };
      })()`;
    await expect
      .poll(() => websiteEval(inspectFirst))
      .toMatchObject({
        hit: 'span',
        inspector: expect.stringContaining('&lt;span&gt;'),
      });

    await websiteEval(`(async () => {
        window.scrollTo(0, 600);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      })()`);
    await expect
      .poll(() =>
        websiteEval(
          `document.querySelector('[aria-label="Selector targeting hint"]')?.textContent`,
        ),
      )
      .toContain('<circle>');

    await websiteEval(`(() => {
        const x = window.innerWidth - 2;
        const y = window.innerHeight - 2;
        document.querySelector('#root').dispatchEvent(
          new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y }),
        );
      })()`);
    await expect
      .poll(() =>
        websiteEval(`Boolean(document.querySelector('[aria-label="Selector targeting hint"]'))`),
      )
      .toBe(false);
  } finally {
    await closeElectron(electronApp);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('selector picker exposes a nearby tree, page search, and dismissal controls', async () => {
  const { electronApp, appWindow, dataDirectory } = await openRecordScreen();
  try {
    await appWindow.getByRole('button', { name: /^Record ?R$/ }).click();
    await appWindow.getByRole('button', { name: /^Hover/ }).click();
    const websiteEval = (source: string) =>
      electronApp.evaluate(async ({ webContents }, script) => {
        const website = webContents
          .getAllWebContents()
          .find((contents) => contents.getURL() === 'http://127.0.0.1:4174/');
        if (!website) throw new Error('Fixture WebContentsView was not found.');
        // Instrument the recorder's isolated world, not the page's separate JS globals.
        return website.executeJavaScriptInIsolatedWorld(999, [{ code: script }]);
      }, source);

    await websiteEval(`(() => {
      document.body.innerHTML = [
        '<div data-testid="id1"><div data-probe="inner" style="padding:20px"><span data-testid="child">Some text</span></div></div>',
        '<section id="remote-group"><button name="remote-control">Remote</button><button name="remote-second">Second remote</button></section>',
        '<div data-outside>Outside</div>',
      ].join('');
      const inner = document.querySelector('[data-probe="inner"]');
      const rect = inner.getBoundingClientRect();
      inner.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        clientX: rect.left + 2,
        clientY: rect.top + 2,
      }));
      inner.click();
    })()`);

    await expect
      .poll(() =>
        websiteEval(`(() => ({
          tree: [...document.querySelectorAll('[role="treeitem"]')].map((item) => ({
            label: item.getAttribute('aria-label'),
            level: item.getAttribute('aria-level'),
          })),
          panel: document.querySelector('[aria-label="Choose locator"]')?.textContent,
        }))()`),
      )
      .toMatchObject({
        tree: [
          { label: 'parent <div data-testid="id1">', level: '1' },
          { label: 'current <div>', level: '2' },
          { label: 'child <span data-testid="child">', level: '3' },
        ],
        panel: expect.stringContaining('data-testid="id1"'),
      });
    expect(
      await websiteEval(`(() => {
      const parent = document.querySelector('[role="treeitem"][aria-level="1"]');
      const current = parent.querySelector('[role="treeitem"][aria-current="true"]');
      const child = current.querySelector('[role="treeitem"][aria-level="3"]');
      return {
        parentTag: parent.querySelector('[data-tree-opening-tag]').textContent,
        currentWeight: getComputedStyle(current.querySelector('[data-tree-opening-tag]')).fontWeight,
        currentColor: getComputedStyle(current.querySelector('[data-tree-opening-tag]')).color,
        parentColor: getComputedStyle(parent.querySelector('[data-tree-opening-tag]')).color,
        currentMarker: current.textContent.includes('# current'),
        inlineSelector: parent.querySelector('[data-tree-opening-tag] button').textContent,
        childText: child.textContent,
        border: getComputedStyle(current).borderColor,
        background: getComputedStyle(current).backgroundColor,
      };
    })()`),
    ).toMatchObject({
      parentTag: '<div data-testid="id1">',
      currentWeight: '700',
      currentColor: 'rgb(196, 181, 253)',
      parentColor: 'rgb(132, 145, 158)',
      currentMarker: false,
      inlineSelector: 'data-testid="id1"',
      childText: expect.stringContaining('Some text'),
      border: 'rgb(57, 135, 229)',
      background: 'rgba(57, 135, 229, 0.06)',
    });
    expect(
      await websiteEval(`(() => {
      const chip = document.querySelector('[data-tree-opening-tag] button');
      const before = getComputedStyle(chip).backgroundColor;
      chip.dispatchEvent(new PointerEvent('pointerenter'));
      const hover = { background: getComputedStyle(chip).backgroundColor, border: getComputedStyle(chip).borderColor };
      chip.dispatchEvent(new PointerEvent('pointerleave'));
      return { before, ...hover, restored: getComputedStyle(chip).backgroundColor };
    })()`),
    ).toEqual({
      before: 'rgba(148, 163, 184, 0.08)',
      background: 'rgba(148, 163, 184, 0.24)',
      border: 'rgb(167, 183, 202)',
      restored: 'rgba(148, 163, 184, 0.08)',
    });
    expect(
      await websiteEval(`(() => {
      const tree = document.querySelector('[aria-label="Nearby element tree"]');
      const current = tree.querySelector('[aria-current="true"]');
      const child = current.querySelector('[role="treeitem"]');
      child.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
      const hovered = { border: getComputedStyle(child).borderColor, background: getComputedStyle(child).backgroundColor, parentBorder: getComputedStyle(current).borderColor };
      tree.dispatchEvent(new PointerEvent('pointerleave'));
      return { ...hovered, restoredBorder: getComputedStyle(child).borderColor };
    })()`),
    ).toEqual({
      border: 'rgb(57, 184, 121)',
      background: 'rgba(57, 184, 121, 0.12)',
      parentBorder: 'rgb(57, 135, 229)',
      restoredBorder: 'rgb(57, 135, 229)',
    });
    await websiteEval(`(() => {
      const choices = [...document.querySelectorAll('[aria-label="Choose locator"] button')];
      const parent = choices.find((button) =>
        button.getAttribute('aria-label') ===
          'parent <div data-testid="id1"> selector data-testid=id1');
      parent.click();
    })()`);

    expect((await appSnapshot(appWindow)).steps.some((step) => step.kind === 'hover')).toBe(false);

    const searchResults = await websiteEval(`(() => {
      window.searchMetrics = { scans: 0, textReads: 0 };
      const querySelectorAll = document.querySelectorAll;
      document.querySelectorAll = function (selector) {
        if (selector === '*') window.searchMetrics.scans += 1;
        return querySelectorAll.call(this, selector);
      };
      const sentinel = document.createElement('button');
      sentinel.id = 'search-sentinel';
      sentinel.textContent = 'Cache sentinel';
      sentinel.style.display = 'none';
      document.body.append(sentinel);
      const textContent = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
      Object.defineProperty(sentinel, 'textContent', { get() {
        window.searchMetrics.textReads += 1;
        return textContent.get.call(this);
      } });
      const search = [...document.querySelectorAll('[aria-label="Choose locator"] button')]
        .find((button) => button.textContent === 'Search on page');
      search?.click();
      const input = document.querySelector('[aria-label="Search page selectors"]');
      if (!input) return undefined;
      input.value = 'remote-control';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return document.querySelector('[aria-label="Page selector results"]')?.textContent;
    })()`);
    expect(searchResults).toContain('<button name="remote-control">');
    expect(await websiteEval('window.searchMetrics')).toEqual({ scans: 1, textReads: 1 });
    expect(
      await websiteEval(`(() => {
      const picker = document.querySelector('[aria-label="Choose locator"]');
      const header = picker.firstElementChild;
      const actions = picker.querySelector('[aria-label="Selector actions"]');
      const results = picker.querySelector('[aria-label="Page selector results"]');
      const input = picker.querySelector('[aria-label="Search page selectors"]');
      input.value = 'remote';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const parent = results.querySelector('[role="treeitem"][aria-level="1"]');
      return {
        headerLayout: getComputedStyle(header).justifyContent,
        actionLabels: [...actions.children].map((button) => button.textContent),
        advancedHint: picker.querySelector('[role="tablist"]').previousElementSibling.textContent,
        separatorBeforeHint: picker.querySelector('#testron-advanced-hint').previousElementSibling.getAttribute('role'),
        tabs: [...picker.querySelectorAll('[role="tab"]')].map((tab) => ({ text: tab.textContent, selected: tab.getAttribute('aria-selected') })),
        nearbyVisible: Boolean(picker.querySelector('[aria-label="Nearby element tree"]')),
        roots: results.querySelectorAll(':scope > [role="treeitem"]').length,
        nestedMatches: parent.querySelectorAll('[role="treeitem"]').length,
      };
    })()`),
    ).toEqual({
      headerLayout: 'space-between',
      actionLabels: ['Cancel', 'Confirm'],
      advancedHint: 'You can change selector in advanced mode',
      separatorBeforeHint: 'separator',
      tabs: [
        { text: 'Current selection', selected: 'false' },
        { text: 'Search on page', selected: 'true' },
      ],
      nearbyVisible: false,
      roots: 1,
      nestedMatches: 2,
    });
    expect(await websiteEval('window.searchMetrics')).toEqual({ scans: 1, textReads: 1 });
    await websiteEval(`document.querySelector('#testron-current-tab').click()`);
    expect(
      await websiteEval(`Boolean(document.querySelector('[aria-label="Search page selectors"]'))`),
    ).toBe(false);
    await websiteEval(`document.querySelector('#testron-search-tab').click()`);
    expect(
      await websiteEval(`document.querySelector('[aria-label="Search page selectors"]').value`),
    ).toBe('remote');
    await websiteEval(`(() => {
      const input = document.querySelector('[aria-label="Search page selectors"]');
      input.value = 'remote-control';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);

    const searchStability = await websiteEval(`(async () => {
      const input = document.querySelector('[aria-label="Search page selectors"]');
      const remote = document.querySelector('[name="remote-control"]');
      if (!input || !remote) return undefined;
      input.focus();
      input.setSelectionRange(2, 8);
      const originalInput = input;
      const originalQuerySelectorAll = document.querySelectorAll;
      let pageScans = 0;
      document.querySelectorAll = function (selector) {
        if (selector === '*') pageScans += 1;
        return originalQuerySelectorAll.call(this, selector);
      };
      const rect = remote.getBoundingClientRect();
      remote.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        clientX: rect.left + 2,
        clientY: rect.top + 2,
      }));
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const currentInput = document.querySelector('[aria-label="Search page selectors"]');
      document.querySelectorAll = originalQuerySelectorAll;
      return {
        sameInput: currentInput === originalInput,
        value: currentInput?.value,
        selectionStart: currentInput?.selectionStart,
        selectionEnd: currentInput?.selectionEnd,
        pageScans,
      };
    })()`);
    expect(searchStability).toEqual({
      sameInput: true,
      value: 'remote-control',
      selectionStart: 2,
      selectionEnd: 8,
      pageScans: 0,
    });
    expect(await websiteEval('window.searchMetrics')).toEqual({ scans: 2, textReads: 2 });

    await websiteEval(`(() => {
      const result = [...document.querySelectorAll('[aria-label="Page selector results"] button')].find((button) => button.textContent === 'name="remote-control"');
      result?.click();
    })()`);
    await expect
      .poll(() =>
        websiteEval(
          `document.querySelector('[aria-label="Choose locator"] > div:first-child > span')?.textContent`,
        ),
      )
      .toBe('<button name="remote-control">');
    expect(await websiteEval('window.searchMetrics')).toEqual({ scans: 2, textReads: 2 });
    expect(
      await websiteEval(`(() => {
      const input = document.querySelector('[aria-label="Search page selectors"]');
      return { start: input.selectionStart, end: input.selectionEnd, value: input.value, focused: document.activeElement === input };
    })()`),
    ).toEqual({ start: 2, end: 8, value: 'remote-control', focused: true });

    // Results are a tab-opening snapshot: omit newly inserted nodes until
    // refresh, but discard detached nodes immediately on the next query.
    await websiteEval(`(() => {
      const added = document.createElement('button');
      added.id = 'fresh-result';
      document.body.append(added);
      document.querySelector('[name="remote-second"]').remove();
      const input = document.querySelector('[aria-label="Search page selectors"]');
      input.value = 'fresh-result';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    expect(
      await websiteEval(
        `document.querySelector('[aria-label="Page selector results"]').textContent`,
      ),
    ).toBe('');
    await websiteEval(`document.querySelector('#testron-current-tab').click()`);
    await websiteEval(`document.querySelector('#testron-search-tab').click()`);
    expect(
      await websiteEval(
        `document.querySelector('[aria-label="Page selector results"]').textContent`,
      ),
    ).toContain('id="fresh-result"');
    await websiteEval(`(() => {
      const input = document.querySelector('[aria-label="Search page selectors"]');
      input.value = 'remote-second';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    expect(
      await websiteEval(
        `document.querySelector('[aria-label="Page selector results"]').textContent`,
      ),
    ).toBe('');
    await websiteEval(`document.querySelector('#testron-current-tab').click()`);
    expect(
      await websiteEval(
        `document.querySelector('[aria-label="Nearby element tree"] [aria-current="true"] [data-tree-opening-tag]').textContent`,
      ),
    ).toBe('<button name="remote-control">');

    await websiteEval(`document.querySelector('#testron-search-tab').click()`);
    expect(await websiteEval(`document.activeElement.getAttribute('aria-label')`)).toBe(
      'Search page selectors',
    );
    await websiteEval(
      `document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`,
    );
    await expect
      .poll(() => websiteEval(`Boolean(document.querySelector('[aria-label="Choose locator"]'))`))
      .toBe(false);
    await expect(appWindow.getByRole('button', { name: /^Hover/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect((await appSnapshot(appWindow)).steps.some((step) => step.kind === 'hover')).toBe(false);
    await appWindow.getByRole('button', { name: /^Hover/ }).click();

    await websiteEval(`(() => {
      const inner = document.querySelector('[data-probe="inner"]');
      const rect = inner.getBoundingClientRect();
      inner.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        clientX: rect.left + 2,
        clientY: rect.top + 2,
      }));
      inner.click();
    })()`);
    await expect
      .poll(() => websiteEval(`Boolean(document.querySelector('[aria-label="Choose locator"]'))`))
      .toBe(true);
    await websiteEval(`document.querySelector('[data-outside]')?.click()`);
    await expect
      .poll(() => websiteEval(`Boolean(document.querySelector('[aria-label="Choose locator"]'))`))
      .toBe(false);
    expect((await appSnapshot(appWindow)).steps.some((step) => step.kind === 'hover')).toBe(false);
  } finally {
    await closeElectron(electronApp);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('pinned picker is reachable with real pointer movement and commits only on confirmation', async () => {
  const { electronApp, appWindow, dataDirectory } = await openRecordScreen();
  try {
    const websiteEval = (script: string) =>
      electronApp.evaluate(async ({ webContents }, source) => {
        const website = webContents
          .getAllWebContents()
          .find((item) => item.getURL() === 'http://127.0.0.1:4174/');
        if (!website) throw new Error('Fixture not found');
        return website.executeJavaScript(source);
      }, script);
    const pointFor = (selector: string) =>
      websiteEval(`(() => {
      const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
    })()`) as Promise<{ x: number; y: number }>;
    let pointer = { x: 0, y: 0 };
    const moveTo = async (point: { x: number; y: number }, click = false, alt = false) => {
      await electronApp.evaluate(
        async ({ webContents, BrowserWindow }, { from, to, click, alt }) => {
          const website = webContents
            .getAllWebContents()
            .find((item) => item.getURL() === 'http://127.0.0.1:4174/');
          if (!website) throw new Error('Fixture not found');
          BrowserWindow.getAllWindows()[0].focus();
          website.focus();
          // Cross the actual gap between the page and the picker, letting each
          // frame run. DOM button.click() cannot catch a panel chasing the mouse.
          for (let step = 1; step <= 12; step += 1) {
            website.sendInputEvent({
              type: 'mouseMove',
              x: Math.round(from.x + ((to.x - from.x) * step) / 12),
              y: Math.round(from.y + ((to.y - from.y) * step) / 12),
            });
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          if (click) {
            website.sendInputEvent({
              type: 'mouseDown',
              ...to,
              button: 'left',
              clickCount: 1,
              modifiers: alt ? ['alt'] : [],
            });
            website.sendInputEvent({
              type: 'mouseUp',
              ...to,
              button: 'left',
              clickCount: 1,
              modifiers: alt ? ['alt'] : [],
            });
          }
        },
        { from: pointer, to: point, click, alt },
      );
      pointer = point;
    };
    const clickSelector = async (selector: string) => moveTo(await pointFor(selector), true);
    await websiteEval(`(() => {
      document.body.style.cssText = 'display:block;margin:0;min-height:1800px';
      document.body.innerHTML = '<div id="root" style="width:100vw;min-height:1800px"><button id="primary" data-testid="primary" style="position:absolute;left:20px;top:20px;width:160px">First</button><button id="secondary" data-testid="secondary" style="position:absolute;left:20px;top:420px;width:160px">Second</button></div>';
      document.querySelector('#secondary').setAttribute('name', 'a&"b');
      window.siteActions = [];
      for (const type of ['pointerdown', 'mousedown', 'click']) document.addEventListener(type, (event) => {
        if (event.target.closest('#primary, #secondary')) window.siteActions.push(type);
      });
    })()`);
    await appWindow.getByRole('button', { name: /^Record ?R$/ }).click();
    const blankPoint = await websiteEval('({ x: window.innerWidth - 20, y: 10 })');
    // Both body and full-page #root hits must leave normal recording usable.
    await websiteEval(`document.querySelector('#root').style.pointerEvents = 'none'`);
    await moveTo(blankPoint, true, true);
    await websiteEval(`document.querySelector('#root').style.pointerEvents = ''`);
    await moveTo(blankPoint, true, true);
    await clickSelector('#primary');
    await expect
      .poll(async () => (await appSnapshot(appWindow)).steps.find((step) => step.kind === 'click'))
      .toMatchObject({ target: { primary: { strategy: 'testId', value: 'primary' } } });
    expect(
      await websiteEval(`Boolean(document.querySelector('[aria-label="Choose locator"]'))`),
    ).toBe(false);
    await websiteEval('window.siteActions = []');
    await appWindow.getByRole('button', { name: /^Hover/ }).click();
    await moveTo(await pointFor('#primary'));
    await expect
      .poll(() =>
        websiteEval(`Boolean(document.querySelector('[aria-label="Selector targeting hint"]'))`),
      )
      .toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect((await appSnapshot(appWindow)).steps.some((step) => step.kind === 'hover')).toBe(false);
    expect(
      await websiteEval(`Boolean(document.querySelector('[aria-label="Choose locator"]'))`),
    ).toBe(false);
    await clickSelector('#primary');
    await expect
      .poll(() => websiteEval(`Boolean(document.querySelector('[aria-label="Choose locator"]'))`))
      .toBe(true);
    const pinnedPosition = await websiteEval(`(() => {
      window.originalPicker = document.querySelector('[aria-label="Choose locator"]');
      const rect = window.originalPicker.getBoundingClientRect();
      return { left: rect.left, top: rect.top };
    })()`);
    await moveTo(await pointFor('#secondary'));
    expect(
      await websiteEval(`(() => {
      const panel = document.querySelector('[aria-label="Choose locator"]');
      const rect = panel.getBoundingClientRect();
      return { sameNode: panel === window.originalPicker, left: rect.left, top: rect.top };
    })()`),
    ).toEqual({ sameNode: true, ...pinnedPosition });
    // Reach and click a locator using native input, without forcing the click.
    const idPoint = await websiteEval(`(() => {
      const button = [...document.querySelectorAll('[aria-label="Choose locator"] button')].find((item) => item.textContent === 'id="primary"');
      const rect = button.getBoundingClientRect();
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
    })()`);
    await moveTo(idPoint, true);
    expect(
      await websiteEval(`Boolean(document.activeElement.closest('[aria-label="Choose locator"]'))`),
    ).toBe(true);
    expect((await appSnapshot(appWindow)).steps.some((step) => step.kind === 'hover')).toBe(false);
    await clickSelector('[aria-label="Record hover"]');
    await expect
      .poll(async () => (await appSnapshot(appWindow)).steps.find((step) => step.kind === 'hover'))
      .toMatchObject({ target: { primary: { strategy: 'id', value: 'primary' } } });
    expect(await websiteEval('window.siteActions')).toEqual([]);

    const snapshot = await appSnapshot(appWindow);
    const index = snapshot.steps.findIndex((step) => step.kind === 'hover');
    await appWindow.evaluate(
      (index) => window.testron.command({ type: 'set-repick-step', index }),
      index,
    );
    await clickSelector('#secondary');
    await expect
      .poll(() => websiteEval(`Boolean(document.querySelector('[aria-label="Apply locator"]'))`))
      .toBe(true);
    expect((await appSnapshot(appWindow)).steps[index]).toEqual(snapshot.steps[index]);
    await clickSelector('#testron-search-tab');
    expect(await websiteEval(`document.activeElement.getAttribute('aria-label')`)).toBe(
      'Search page selectors',
    );
    await electronApp.evaluate(({ webContents }) => {
      const website = webContents
        .getAllWebContents()
        .find((item) => item.getURL() === 'http://127.0.0.1:4174/')!;
      website.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      website.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    });
    await expect.poll(async () => (await appSnapshot(appWindow)).repickIndex).toBeUndefined();
    expect((await appSnapshot(appWindow)).steps[index]).toEqual(snapshot.steps[index]);

    await appWindow.evaluate(
      (index) => window.testron.command({ type: 'set-repick-step', index }),
      index,
    );
    await clickSelector('#secondary');
    await clickSelector('#testron-search-tab');
    expect(await websiteEval(`document.activeElement.getAttribute('aria-label')`)).toBe(
      'Search page selectors',
    );
    await clickSelector('[aria-label="Cancel selector picker"]');
    await expect.poll(async () => (await appSnapshot(appWindow)).repickIndex).toBeUndefined();
    expect((await appSnapshot(appWindow)).steps[index]).toEqual(snapshot.steps[index]);
    await appWindow.evaluate(
      (index) => window.testron.command({ type: 'set-repick-step', index }),
      index,
    );
    await clickSelector('#secondary');
    expect(
      await websiteEval(`document.querySelector('[aria-label*="selector name="]').textContent`),
    ).toBe('name="a&"b"');
    await clickSelector('[aria-label*="selector name="]');
    await clickSelector('[aria-label="Apply locator"]');
    await expect
      .poll(async () => (await appSnapshot(appWindow)).steps[index])
      .toMatchObject({ target: { primary: { strategy: 'name', value: 'a&"b' } } });
    await expect.poll(async () => (await appSnapshot(appWindow)).repickIndex).toBeUndefined();
    expect(await websiteEval('window.siteActions')).toEqual([]);
  } finally {
    await closeElectron(electronApp);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('records only an explicitly armed hover before asserting dynamic popover content', async () => {
  const { electronApp, appWindow, dataDirectory } = await openRecordScreen();
  try {
    await appWindow.getByRole('button', { name: /^Record ?R$/ }).click();
    const websiteEval = (source: string) =>
      electronApp.evaluate(async ({ webContents }, script) => {
        const website = webContents
          .getAllWebContents()
          .find((contents) => contents.getURL() === 'http://127.0.0.1:4174/');
        if (!website) throw new Error('Fixture WebContentsView was not found.');
        return website.executeJavaScript(script);
      }, source);

    await websiteEval(`(() => {
      document.body.innerHTML = '<button data-testid="help">Help</button>';
      const help = document.querySelector('[data-testid="help"]');
      help.addEventListener('pointermove', () => {
        if (!document.querySelector('[data-testid="popover"]'))
          document.body.insertAdjacentHTML('beforeend', '<div data-testid="popover">Details</div>');
      });
      const rect = help.getBoundingClientRect();
      help.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        clientX: rect.left + 2,
        clientY: rect.top + 2,
      }));
    })()`);

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect((await appSnapshot(appWindow)).steps.some((step) => step.kind === 'hover')).toBe(false);

    await appWindow.getByRole('button', { name: /^Hover/ }).click();
    await websiteEval(`(() => {
      const help = document.querySelector('[data-testid="help"]');
      const rect = help.getBoundingClientRect();
      help.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        clientX: rect.left + 2,
        clientY: rect.top + 2,
      }));
      help.click();
    })()`);

    expect((await appSnapshot(appWindow)).steps.some((step) => step.kind === 'hover')).toBe(false);
    await websiteEval(`document.querySelector('[aria-label="Record hover"]').click()`);

    await expect
      .poll(async () => (await appSnapshot(appWindow)).steps.find((step) => step.kind === 'hover'))
      .toMatchObject({
        target: { primary: { strategy: 'testId', value: 'help' } },
      });
    await expect(appWindow.getByRole('button', { name: /^Hover/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await appWindow.getByRole('button', { name: 'Assert' }).click();
    await websiteEval(`(() => {
      const popover = document.querySelector('[data-testid="popover"]');
      const rect = popover.getBoundingClientRect();
      popover.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        clientX: rect.left + 2,
        clientY: rect.top + 2,
      }));
      popover.click();
    })()`);

    await expect
      .poll(() =>
        websiteEval(`(() => {
          const panel = document.querySelector('[aria-label="Choose locator"]');
          const choices = document.querySelector('[aria-label="Nearby element tree"]');
          const selector = choices?.querySelector('[aria-label="current locator choices"] button');
          window.dispatchEvent(new PointerEvent('pointerout', { relatedTarget: null }));
          return {
            panelVisible: Boolean(panel),
            direction: choices ? getComputedStyle(choices).flexDirection : undefined,
            whiteSpace: selector ? getComputedStyle(selector).whiteSpace : undefined,
            selectorText: selector?.textContent,
          };
        })()`),
      )
      .toMatchObject({
        panelVisible: true,
        direction: 'column',
        whiteSpace: 'normal',
        selectorText: 'data-testid="popover"',
      });
    await websiteEval(`document.querySelector('[data-testid="help"]').click()`);
    await expect
      .poll(() => websiteEval(`Boolean(document.querySelector('[aria-label="Choose locator"]'))`))
      .toBe(false);
    expect((await appSnapshot(appWindow)).steps.some((step) => step.kind === 'assertElement')).toBe(
      false,
    );

    await appWindow.getByRole('button', { name: 'Assert' }).click();
    await websiteEval(`document.querySelector('[data-testid="popover"]').click()`);
    await expect
      .poll(() =>
        websiteEval(`Boolean(document.querySelector('[aria-label="Confirm assertion"]'))`),
      )
      .toBe(true);
    await websiteEval(`document.querySelector('[aria-label="Confirm assertion"]').click()`);

    await expect
      .poll(async () =>
        (await appSnapshot(appWindow)).steps.find((step) => step.kind === 'assertElement'),
      )
      .toMatchObject({
        target: { primary: { strategy: 'testId', value: 'popover' } },
        assertion: { type: 'visible' },
      });
  } finally {
    await closeElectron(electronApp);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('explicit locator editor chooses a primary locator and an action can become an assertion', async () => {
  const { electronApp, appWindow, dataDirectory } = await openRecordScreen();
  try {
    await appWindow.getByRole('button', { name: /^Record ?R$/ }).click();

    await expect
      .poll(() =>
        electronApp.evaluate(async ({ webContents }) => {
          const website = webContents
            .getAllWebContents()
            .find((contents) => contents.getURL() === 'http://127.0.0.1:4174/');
          if (!website) return false;
          return website.executeJavaScript(`(() => {
            const input = document.querySelector('[data-testid="email"]');
            const rect = input.getBoundingClientRect();
            input.dispatchEvent(new PointerEvent('pointermove', {
              bubbles: true,
              clientX: rect.left + 4,
              clientY: rect.top + 4,
            }));
            if (document.querySelector('[aria-label="Choose locator"]')) return false;
            input.dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true, clientX: rect.left + 4, clientY: rect.top + 4 }));
            const choices = [...document.querySelectorAll('[aria-label="Choose locator"] button')];
            const idChoice = choices.find((button) => button.textContent === 'id="email"');
            if (!idChoice) return false;
            idChoice.click();
            document.querySelector('[aria-label="Use locator"]').click();
            input.value = 'picked@example.test';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
            input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
            return true;
          })()`);
        }),
      )
      .toBe(true);

    await expect.poll(async () => (await appSnapshot(appWindow)).steps.length).toBe(3);
    const before = await appSnapshot(appWindow);
    expect(before.steps[1]).toMatchObject({
      kind: 'fill',
      target: { primary: { strategy: 'id', value: 'email' } },
    });
    expect(before.steps[2]).toMatchObject({
      kind: 'press',
      key: 'Tab',
      target: { primary: { strategy: 'id', value: 'email' } },
    });
    const conversion = appWindow.getByLabel('Convert step 1 to assertion');
    await conversion.evaluate((button) => (button as HTMLElement).click());

    await expect
      .poll(async () => (await appSnapshot(appWindow)).steps[0]?.kind)
      .toBe('assertUrlPath');
  } finally {
    await closeElectron(electronApp);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('a panel can be resized beside the embedded page', async () => {
  const { electronApp, appWindow, dataDirectory } = await openRecordScreen();
  try {
    const plane = (await appWindow.locator('[data-plane]').boundingBox())!;
    const separator = appWindow.getByRole('separator', { name: 'Resize test steps' });
    const handle = (await separator.boundingBox())!;
    await appWindow.mouse.move(handle.x + handle.width / 2, handle.y + 20);
    await appWindow.mouse.down();
    await appWindow.mouse.move(plane.x + plane.width * 0.35, handle.y + 20);
    await appWindow.mouse.up();
    await expect
      .poll(
        async () =>
          (await appWindow.getByRole('complementary', { name: 'Test steps' }).boundingBox())!.width,
      )
      .toBeCloseTo(plane.width * 0.35, 0);
    await expect.poll(() => childBounds(electronApp)).toEqual([]);
  } finally {
    await closeElectron(electronApp);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('hiding a panel takes its view off the window', async () => {
  const { electronApp, appWindow, dataDirectory } = await openRecordScreen();
  try {
    const plane = await appWindow.evaluate(() => {
      const rect = document.querySelector('[data-plane]')!.getBoundingClientRect();
      return { x: Math.round(rect.x), width: Math.round(rect.width) };
    });

    const stepsToggle = appWindow.locator('button[aria-pressed]').filter({ hasText: 'Test steps' });
    await stepsToggle.click();
    await expect(appWindow.getByRole('complementary', { name: 'Test steps' })).toHaveCount(0);
    const expandedWebsite = (await appWindow.locator('webview').boundingBox())!;
    expect(expandedWebsite.x).toBeCloseTo(plane.x, 0);
    expect(expandedWebsite.width).toBeCloseTo(plane.width * 0.75, 0);

    await stepsToggle.click();
    await expect(appWindow.getByRole('complementary', { name: 'Test steps' })).toBeVisible();
    const resizedWebsite = (await appWindow.locator('webview').boundingBox())!;
    expect(resizedWebsite.x).toBeCloseTo(plane.x + plane.width * 0.25, 0);
    expect(resizedWebsite.width).toBeCloseTo(plane.width * 0.5, 0);
  } finally {
    await closeElectron(electronApp);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('records live website interactions and saves the new test', async () => {
  const { electronApp, appWindow, dataDirectory } = await openRecordScreen();
  try {
    appWindow.evaluate(() => window.testron.command({ type: 'create-project', name: 'Phase 2' }));
    await expect.poll(async () => (await appSnapshot(appWindow)).library.projects.length).toBe(1);
    const projectId = (await appSnapshot(appWindow)).library.selectedProjectId!;
    appWindow.evaluate(
      (id) =>
        window.testron.command({
          type: 'create-environment',
          projectId: id,
          name: 'Local',
          baseUrl: 'http://127.0.0.1:4174/',
          testIdAttribute: 'data-testid',
        }),
      projectId,
    );
    await expect
      .poll(async () => (await appSnapshot(appWindow)).library.selectedEnvironmentId)
      .toBeTruthy();

    await appWindow.getByRole('button', { name: /^Record ?R$/ }).click();
    await expect(appWindow.getByRole('button', { name: 'Pause' })).toBeVisible();

    await electronApp.evaluate(async ({ webContents }) => {
      const website = webContents
        .getAllWebContents()
        .find((contents) => contents.getURL() === 'http://127.0.0.1:4174/');
      if (!website) throw new Error('Fixture WebContentsView was not found.');
      await website.executeJavaScript(`(() => {
        const input = document.querySelector('[data-testid="email"]');
        input.value = 'phase-two@example.test';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      })()`);
    });

    await appWindow.getByRole('button', { name: 'Finish', exact: true }).click();
    await appWindow.getByLabel('Test name').fill('Phase 2 live flow');
    await appWindow.getByRole('button', { name: 'Save and open test' }).click();

    await expect
      .poll(async () => (await appSnapshot(appWindow)).library.tests[0]?.title)
      .toBe('Phase 2 live flow');
    await expect
      .poll(async () => (await appSnapshot(appWindow)).steps.some((step) => 'value' in step))
      .toBe(true);
  } finally {
    await closeElectron(electronApp);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});
