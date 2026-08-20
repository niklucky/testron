import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { AppSnapshot } from '../../src/preload/api';

/**
 * The record screen's panels are opaque blocks in WebContentsViews docked beside
 * the website view. Opening one must reduce the website viewport; hiding one
 * gives that width back rather than leaving an invisible click-swallowing gap.
 */
const openRecordScreen = async () => {
  const dataDirectory = mkdtempSync(path.join(tmpdir(), 'testron-panels-'));
  const electronApp = await electron.launch({
    args: ['.'],
    env: { ...process.env, TESTRON_DATA_DIR: dataDirectory },
  });
  const appWindow = await electronApp.firstWindow();
  await appWindow.evaluate(() => {
    window.location.hash = '#/record';
  });
  await appWindow.getByRole('button', { name: 'Record' }).waitFor({ timeout: 10_000 });
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

  // The panel views load in the background so they never delay startup; every
  // test here needs them present before it can say anything about them.
  await expect
    .poll(() =>
      electronApp.evaluate(
        ({ webContents }) =>
          webContents
            .getAllWebContents()
            .filter((contents) => contents.getURL().includes('#/panel/')).length,
      ),
    )
    .toBe(2);

  return { electronApp, appWindow, dataDirectory };
};

/** Bounds of the window's child views, in stacking order. */
const childBounds = (electronApp: Awaited<ReturnType<typeof electron.launch>>) =>
  electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].contentView.children.map((child) => child.getBounds()),
  );

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

    await appWindow.getByRole('button', { name: 'Record' }).click();
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
    await electronApp.close().catch(() => undefined);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('records a table row collection count with its current match total', async () => {
  const { electronApp, appWindow, dataDirectory } = await openRecordScreen();
  try {
    await appWindow.getByRole('button', { name: 'Record' }).click();
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
    await electronApp.close().catch(() => undefined);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('failed assertions show their error and repeated runs append cards', async () => {
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
          environmentId,
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
    await expect.poll(() => appWindow.evaluate(() => window.innerWidth)).toBeGreaterThan(1920);
    await appWindow.getByRole('button', { name: 'View source' }).click();
    const dockedSource = appWindow.getByRole('complementary', { name: 'Auto test source' });
    await expect(dockedSource).toBeVisible();
    await expect(appWindow.getByRole('dialog', { name: 'Auto test source' })).toHaveCount(0);
    const [boardBox, sourceBox] = await Promise.all([
      appWindow.getByTestId('test-board').boundingBox(),
      dockedSource.boundingBox(),
    ]);
    expect(Math.abs(boardBox!.width - sourceBox!.width)).toBeLessThanOrEqual(2);
  } finally {
    await electronApp.close().catch(() => undefined);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('test steps scroll without source and locators can be repaired inline', async () => {
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
      ({ projectId, environmentId }) =>
        window.testron.command({
          type: 'create-test',
          projectId,
          environmentId,
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

    await appWindow.getByLabel('Repick element for step 1', { exact: true }).click();
    await appWindow.getByRole('button', { name: /Continue recording|Record/ }).waitFor();
    const repickWebsiteEval = (source: string) =>
      electronApp.evaluate(async ({ webContents }, script) => {
        const website = webContents
          .getAllWebContents()
          .find((contents) => contents.getURL() === 'http://127.0.0.1:4174/');
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
    await electronApp.close().catch(() => undefined);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('the panels are their own views docked beside the resized page', async () => {
  const { electronApp, appWindow, dataDirectory } = await openRecordScreen();
  try {
    await expect
      .poll(() =>
        electronApp.evaluate(({ webContents }) =>
          webContents.getAllWebContents().map((contents) => contents.getURL()),
        ),
      )
      .toEqual(expect.arrayContaining([expect.stringContaining('#/panel/steps')]));

    const plane = await appWindow.evaluate(() => {
      const rect = document.querySelector('[data-plane]')!.getBoundingClientRect();
      return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width) };
    });

    await expect
      .poll(() => childBounds(electronApp))
      .toEqual([
        // Both 25% panels take real space; the site occupies the middle 50%.
        expect.objectContaining({
          x: plane.x + Math.round(plane.width * 0.25),
          y: plane.y,
          width: plane.width - Math.round(plane.width * 0.25) * 2,
        }),
        expect.objectContaining({ x: plane.x, y: plane.y, width: Math.round(plane.width * 0.25) }),
        expect.objectContaining({
          x: plane.x + plane.width - Math.round(plane.width * 0.25),
          y: plane.y,
          width: Math.round(plane.width * 0.25),
        }),
      ]);
  } finally {
    await electronApp.close().catch(() => undefined);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('panel blocks are opaque over the tested website', async () => {
  const { electronApp, dataDirectory } = await openRecordScreen();
  try {
    const backgrounds = await electronApp.evaluate(async ({ webContents }) =>
      Promise.all(
        webContents
          .getAllWebContents()
          .filter((contents) => contents.getURL().includes('#/panel/'))
          .map((contents) =>
            contents.executeJavaScript(
              `getComputedStyle(document.querySelector('aside')).backgroundColor`,
            ),
          ),
      ),
    );
    expect(backgrounds).toEqual(['rgb(20, 24, 27)', 'rgb(20, 24, 27)']);
  } finally {
    await electronApp.close().catch(() => undefined);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('hover inspector targets deep HTML and SVG content and re-hits after scrolling', async () => {
  const { electronApp, appWindow, dataDirectory } = await openRecordScreen();
  try {
    await appWindow.getByRole('button', { name: 'Record' }).click();
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
    await electronApp.close().catch(() => undefined);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('hover picker chooses a primary locator and an action can become an assertion', async () => {
  const { electronApp, appWindow, dataDirectory } = await openRecordScreen();
  try {
    await appWindow.getByRole('button', { name: 'Record' }).click();

    await electronApp.evaluate(async ({ webContents }) => {
      const website = webContents
        .getAllWebContents()
        .find((contents) => contents.getURL() === 'http://127.0.0.1:4174/');
      if (!website) throw new Error('Fixture WebContentsView was not found.');
      await website.executeJavaScript(`(() => {
        const input = document.querySelector('[data-testid="email"]');
        const rect = input.getBoundingClientRect();
        input.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true,
          clientX: rect.left + 4,
          clientY: rect.top + 4,
        }));
        const choices = [...document.querySelectorAll('[aria-label="Choose locator"] button')];
        const idChoice = choices.find((button) => button.textContent === 'id=email');
        if (!idChoice) throw new Error('The id locator choice was not shown.');
        idChoice.click();
        input.value = 'picked@example.test';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
        input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      })()`);
    });

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
    const conversionButtons = () =>
      electronApp.evaluate(async ({ webContents }) => {
        const panel = webContents
          .getAllWebContents()
          .find((contents) => contents.getURL().includes('#/panel/steps'));
        if (!panel) throw new Error('The steps panel view was not found.');
        return panel.executeJavaScript(
          `[...document.querySelectorAll('button')].map((button) => button.getAttribute('aria-label')).filter(Boolean)`,
        );
      });
    await expect
      .poll(conversionButtons)
      .toEqual(expect.arrayContaining(['Convert step 1 to assertion']));
    await electronApp.evaluate(async ({ webContents }) => {
      const panel = webContents
        .getAllWebContents()
        .find((contents) => contents.getURL().includes('#/panel/steps'))!;
      await panel.executeJavaScript(
        `document.querySelector('[aria-label="Convert step 1 to assertion"]').click()`,
      );
    });

    await expect
      .poll(async () => (await appSnapshot(appWindow)).steps[0]?.kind)
      .toBe('assertUrlPath');
  } finally {
    await electronApp.close().catch(() => undefined);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('a panel being dragged takes the whole plane so the pointer cannot escape it', async () => {
  const { electronApp, appWindow, dataDirectory } = await openRecordScreen();
  try {
    const drag = (width: number, done: boolean) =>
      electronApp.evaluate(
        async ({ webContents }, payload) => {
          const panel = webContents
            .getAllWebContents()
            .find((contents) => contents.getURL().includes('#/panel/steps'));
          if (!panel) throw new Error('The steps panel view was not found.');
          await panel.executeJavaScript(
            `window.testron.sendRecordEvent(${JSON.stringify(payload)})`,
          );
        },
        { type: 'resize', panel: 'steps', width, done },
      );

    const plane = await appWindow.evaluate(() =>
      Math.round(document.querySelector('[data-plane]')!.getBoundingClientRect().width),
    );

    await drag(35, false);
    await expect.poll(async () => (await childBounds(electronApp))[1].width).toBe(plane);

    await drag(35, true);
    await expect
      .poll(async () => (await childBounds(electronApp))[1].width)
      .toBe(Math.round(plane * 0.35));
    await expect
      .poll(async () => (await childBounds(electronApp))[0])
      .toMatchObject({
        x: expect.any(Number),
        width: plane - Math.round(plane * 0.35) - Math.round(plane * 0.25),
      });
  } finally {
    await electronApp.close().catch(() => undefined);
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

    await appWindow.getByRole('button', { name: 'Test steps' }).click();
    await expect.poll(async () => (await childBounds(electronApp))[1].width).toBe(0);
    await expect
      .poll(async () => (await childBounds(electronApp))[0])
      .toMatchObject({
        x: plane.x,
        width: plane.width - Math.round(plane.width * 0.25),
      });

    await appWindow.getByRole('button', { name: 'Test steps' }).click();
    await expect.poll(async () => (await childBounds(electronApp))[1].width).toBeGreaterThan(0);
    await expect
      .poll(async () => (await childBounds(electronApp))[0])
      .toMatchObject({
        x: plane.x + Math.round(plane.width * 0.25),
        width: plane.width - Math.round(plane.width * 0.25) * 2,
      });
  } finally {
    await electronApp.close().catch(() => undefined);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('records live website interactions and saves the new test', async () => {
  const { electronApp, appWindow, dataDirectory } = await openRecordScreen();
  try {
    await appWindow.getByRole('button', { name: 'Record' }).click();
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

    await expect(appWindow.getByText('Phase 2 live flow', { exact: true }).first()).toBeVisible();
    await expect(appWindow.getByText('phase-two@example.test', { exact: true })).toBeVisible();

    await appWindow.getByRole('button', { name: 'Test name — click to edit' }).click();
    await appWindow.getByLabel('Test name').fill('Phase 2 edited flow');
    await appWindow.getByLabel('Test name').press('Enter');
    await expect(appWindow.getByText('Phase 2 edited flow', { exact: true }).first()).toBeVisible();

    await appWindow.getByRole('button', { name: 'Step 2 value — click to edit' }).click();
    await appWindow.getByLabel('Step 2 value').fill('edited@example.test');
    await appWindow.getByLabel('Step 2 value').press('Enter');
    await expect(appWindow.getByText('edited@example.test', { exact: true })).toBeVisible();

    await appWindow
      .getByRole('button', { name: 'Assert something after step 2' })
      .click({ force: true });
    await expect(appWindow.getByLabel('Assertion', { exact: true })).toHaveValue('visible');

    await appWindow.getByRole('button', { name: 'Run on Local' }).click();
    await expect(appWindow.getByText('Passed', { exact: true })).toBeVisible({ timeout: 15_000 });

    await appWindow.evaluate(() => {
      window.location.hash = '#/recorder';
    });
    await expect(appWindow.getByLabel('Test', { exact: true })).toContainText(
      'Phase 2 edited flow',
    );
    await expect(appWindow.locator('.human')).toContainText('edited@example.test');
  } finally {
    await electronApp.close().catch(() => undefined);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});
