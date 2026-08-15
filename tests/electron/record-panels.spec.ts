import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * The record screen's panels are transparent WebContentsViews stacked over the
 * website view, which is a layout no unit test can see. What matters is the
 * arrangement: the site fills the plane the screen measured, the panels sit at
 * its edges *above* it, and hiding one takes its view off the window rather
 * than leaving an invisible rectangle swallowing clicks.
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
  return { electronApp, appWindow, dataDirectory };
};

/** Bounds of the window's child views, in stacking order. */
const childBounds = (electronApp: Awaited<ReturnType<typeof electron.launch>>) =>
  electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].contentView.children.map((child) => child.getBounds()),
  );

test('the panels are their own views, stacked over the page', async () => {
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
        // The site takes the whole plane; the panels overlay it rather than
        // taking width from it.
        expect.objectContaining({ x: plane.x, y: plane.y, width: plane.width }),
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

test('a panel being dragged takes the whole plane so the pointer cannot escape it', async () => {
  const { electronApp, appWindow, dataDirectory } = await openRecordScreen();
  try {
    const drag = (width: number, done: boolean) =>
      electronApp.evaluate(
        async ({ webContents }, payload) => {
          const panel = webContents
            .getAllWebContents()
            .find((contents) => contents.getURL().endsWith('#/panel/steps'));
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
  } finally {
    await electronApp.close().catch(() => undefined);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('hiding a panel takes its view off the window', async () => {
  const { electronApp, appWindow, dataDirectory } = await openRecordScreen();
  try {
    await appWindow.getByRole('button', { name: 'Test steps' }).click();
    await expect.poll(async () => (await childBounds(electronApp))[1].width).toBe(0);

    await appWindow.getByRole('button', { name: 'Test steps' }).click();
    await expect.poll(async () => (await childBounds(electronApp))[1].width).toBeGreaterThan(0);
  } finally {
    await electronApp.close().catch(() => undefined);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});
