import { chromium } from '@playwright/test';
import { expect, it } from 'vitest';
import type { Step } from '@testron/domain/steps/schema';
import { replayPage } from '../../src/main/recording/replay-page';

it('prepares and highlights collection assertions without weakening action strictness', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<div data-testid="row">A</div><div data-testid="row">B</div><div data-testid="row">C</div>',
    );
    const target = {
      primary: { strategy: 'testId' as const, attribute: 'data-testid', value: 'row' },
      alternatives: [],
    };
    const metadata = { recordedAt: new Date(0).toISOString() };
    const evaluate = (step: Step, operation: 'prepare' | 'highlight') =>
      page.evaluate(
        `(${replayPage.toString()})(${JSON.stringify(step)}, ${JSON.stringify(operation)})`,
      );
    for (const operator of ['equals', 'atLeast'] as const) {
      const step: Step = {
        version: 1,
        kind: 'assertElement',
        target,
        metadata,
        assertion: { type: 'count', operator, expected: 3 },
      };
      expect(await evaluate(step, 'prepare')).toEqual({ ready: true });
      expect(await evaluate(step, 'highlight')).toEqual({ ready: true });
    }
    await expect(
      evaluate({ version: 1, kind: 'click', target, metadata }, 'prepare'),
    ).rejects.toThrow('ambiguous');
    await page.setContent('');
    const zero: Step = {
      version: 1,
      kind: 'assertElement',
      target,
      metadata,
      assertion: { type: 'count', operator: 'equals', expected: 0 },
    };
    expect(await evaluate(zero, 'prepare')).toEqual({ ready: true });
    expect(await evaluate(zero, 'highlight')).toEqual({ ready: true });
  } finally {
    await browser.close();
  }
});
