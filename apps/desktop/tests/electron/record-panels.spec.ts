import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
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

    await appWindow.getByRole('button', { name: 'recorded test' }).click();
    await expect(appWindow.getByRole('dialog', { name: 'Edit test title' })).toBeVisible();
    await expect.poll(() => childBounds(electronApp)).toEqual([]);
    await appWindow.getByRole('button', { name: 'Cancel' }).click();

    await appWindow.getByLabel('Create authentication profile').click();
    await expect(appWindow.getByRole('dialog', { name: 'Authentication profile' })).toBeVisible();
    await expect.poll(() => childBounds(electronApp)).toEqual([]);
    await appWindow.getByRole('button', { name: 'Cancel' }).click();

    await appWindow.getByLabel('Back to the dashboard').click();
    await expect.poll(async () => (await childBounds(electronApp))[0]?.width).toBeGreaterThan(0);
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
      await expect(appWindow.getByRole('option', { name: 'Administrator' })).toBeVisible();
      await expect.poll(() => childBounds(electronApp)).toEqual([]);
      await appWindow.getByRole('option', { name: 'Administrator' }).click({ timeout: 5_000 });

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

test('header and cookie profiles are applied to recording requests', async () => {
  test.setTimeout(60_000);
  const { electronApp, appWindow, dataDirectory } = await openRecordScreen();
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
      await appWindow.evaluate(
        (url) => window.testron.command({ type: 'navigate', url }),
        `http://127.0.0.1:4174/request-profile?${suffix}`,
      );
      return expect
        .poll(() =>
          electronApp.evaluate(({ webContents }) => {
            const website = webContents
              .getAllWebContents()
              .find((contents) => contents.getURL().includes('/request-profile'));
            return website?.executeJavaScript(
              `document.querySelector('[data-testid="profile-request"]')?.textContent`,
            );
          }),
        )
        .toBeDefined();
    };

    await requestEvidence('headers');
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
  } finally {
    await closeElectron(electronApp);
    rmSync(dataDirectory, { recursive: true, force: true });
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
    await websiteEval(`document.querySelector('tbody td').click()`);

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
          reuseAuthState: false,
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
          '<span data-probe="first" style="position:absolute;left:10px;top:100px;width:200px;height:80px">Card text</span>',
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
        return {
          hit: first?.tagName?.toLowerCase(),
          inspector: document.querySelector('[aria-label="Choose locator"]')?.outerHTML,
        };
      })()`;
    await expect
      .poll(() => websiteEval(inspectFirst))
      .toMatchObject({
        hit: 'span',
        inspector: expect.stringContaining('>span<'),
      });

    await websiteEval(`(async () => {
        window.scrollTo(0, 600);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      })()`);
    await expect
      .poll(() =>
        websiteEval(`document.querySelector('[aria-label="Choose locator"] > span')?.textContent`),
      )
      .toBe('circle');

    await websiteEval(`(() => {
        document.querySelector('#root').dispatchEvent(
          new PointerEvent('pointermove', { bubbles: true, clientX: 300, clientY: 300 }),
        );
      })()`);
    await expect
      .poll(() => websiteEval(`Boolean(document.querySelector('[aria-label="Choose locator"]'))`))
      .toBe(false);
  } finally {
    await closeElectron(electronApp);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('hover picker chooses a primary locator and an action can become an assertion', async () => {
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
            const choices = [...document.querySelectorAll('[aria-label="Choose locator"] button')];
            const idChoice = choices.find((button) => button.textContent === 'id=email');
            if (!idChoice) return false;
            idChoice.click();
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
