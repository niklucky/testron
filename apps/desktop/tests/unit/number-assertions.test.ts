import { chromium } from '@playwright/test';
import { expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type numberMatchers, numericAssertionSource } from '@testron/domain/steps/numbers';
import { expect as playwrightExpect } from '@playwright/test';
import type { Step } from '@testron/domain/steps/schema';
import { replayPage } from '../../src/main/recording/replay-page';
import { LocalReplayRunner } from '../../src/main/replay/runner';
const metadata = { recordedAt: new Date(0).toISOString() };
const target = { primary: { strategy: 'id' as const, value: 'score' }, alternatives: [] };
const step = (operator: keyof typeof numberMatchers, expected: number): Step => ({
  version: 1,
  kind: 'assertElement',
  target,
  metadata,
  assertion: { type: 'number', operator, expected },
});
it('matches numeric boundaries consistently in page replay and exported code', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="score">69</div>');
    for (const [operator, expected, ready] of [
      ['equals', 69, true],
      ['equals', 42, false],
      ['greaterThan', 42, true],
      ['greaterThan', 69, false],
      ['atLeast', 69, true],
      ['atLeast', 70, false],
      ['lessThan', 70, true],
      ['lessThan', 69, false],
      ['atMost', 69, true],
      ['atMost', 42, false],
    ] as const) {
      expect(
        await page.evaluate(
          `(${replayPage.toString()})(${JSON.stringify(step(operator, expected))}, 'prepare')`,
        ),
      ).toEqual({ ready });
      const source = numericAssertionSource("page.locator('#score')", operator, expected);
      const run = new Function('page', 'expect', `return (async () => { ${source} })();`);
      if (ready) await run(page, playwrightExpect.configure({ timeout: 100 }));
      else await expect(run(page, playwrightExpect.configure({ timeout: 100 }))).rejects.toThrow();
    }
    for (const text of ['', ' ', '69 widgets', 'Infinity']) {
      await page.locator('#score').evaluate((element, text) => {
        element.textContent = text;
      }, text);
      expect(
        await page.evaluate(
          `(${replayPage.toString()})(${JSON.stringify(step('atLeast', 0))}, 'prepare')`,
        ),
      ).toEqual({ ready: false });
    }
    await page.locator('#score').evaluate((element) => {
      element.textContent = ' -0.5 ';
    });
    expect(
      await page.evaluate(
        `(${replayPage.toString()})(${JSON.stringify(step('equals', -0.5))}, 'prepare')`,
      ),
    ).toEqual({ ready: true });
  } finally {
    await browser.close();
  }
});
it('retries numeric assertions in the local runner until text updates', async () => {
  const artifactsDirectory = mkdtempSync(path.join(tmpdir(), 'testron-numbers-'));
  try {
    const result = await new LocalReplayRunner().run({
      steps: [
        {
          version: 1,
          kind: 'navigate',
          metadata,
          url:
            'data:text/html,' +
            encodeURIComponent(
              '<div id="score">loading</div><script>setTimeout(() => document.getElementById("score").textContent = "69", 300)</script>',
            ),
        },
        step('atLeast', 42),
      ],
      onProgress: () => {},
      environmentVariables: {},
      timeoutMs: 2000,
      artifactsDirectory,
    });
    expect(result.status).toBe('passed');
  } finally {
    rmSync(artifactsDirectory, { recursive: true, force: true });
  }
});
