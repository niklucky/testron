import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AppSnapshot } from '../../src/preload/api';
import { closeElectron } from './helpers/close-electron';

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

for (const cancelFirstQuit of [false, true]) {
  test(`quitting with the recorder open keeps SQLite alive through window teardown${cancelFirstQuit ? ' after a canceled quit' : ''}`, async () => {
    const dataDirectory = mkdtempSync(path.join(tmpdir(), 'testron-shutdown-'));
    const app = await electron.launch({
      args: ['.'],
      env: { ...process.env, TESTRON_DATA_DIR: dataDirectory, TESTRON_LOCAL_MODE: '1' },
    });
    let stderr = '';
    app.process().stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    try {
      // Turn a native exception dialog into a test failure instead of blocking the test run.
      await app.evaluate(({ dialog }) => {
        dialog.showErrorBox = (title, content) => {
          process.stderr.write(`SHUTDOWN_ERROR: ${title}\n${content}\n`);
        };
      });
      const page = await app.firstWindow();
      await page.evaluate(() => {
        window.location.hash = '#/record';
      });
      await page.getByRole('button', { name: /^Record ?R$/ }).waitFor();
      await page.evaluate(() =>
        window.testron.command({ type: 'navigate', url: 'http://127.0.0.1:4174/' }),
      );
      await expect
        .poll(() =>
          app.evaluate(async ({ webContents }) => {
            const website = webContents
              .getAllWebContents()
              .find((contents) => contents.getType() === 'webview');
            return (
              website && website.executeJavaScript("Boolean(document.querySelector('#email'))")
            );
          }),
        )
        .toBe(true);
      await page.getByRole('button', { name: /^Record ?R$/ }).click();
      await expect.poll(async () => (await snapshot(page)).recording).toBe(true);

      if (cancelFirstQuit) {
        await app.evaluate(({ app }) => {
          app.once('before-quit', (event) => event.preventDefault());
          app.quit();
        });
        // The canceled attempt must leave the session and database available.
        const state = await snapshot(page);
        expect(state.recording).toBe(true);
        expect(Array.isArray(state.library.projects)).toBe(true);
      }

      const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
        app.process().once('exit', (code, signal) => resolve({ code, signal }));
      });
      void app.evaluate(({ app }) => app.quit()).catch(() => undefined);
      expect(await exited).toEqual({ code: 0, signal: null });
      expect(stderr).not.toContain('SHUTDOWN_ERROR:');
      expect(stderr).not.toContain('database is not open');
    } finally {
      await closeElectron(app);
      rmSync(dataDirectory, { recursive: true, force: true });
    }
  });
}
