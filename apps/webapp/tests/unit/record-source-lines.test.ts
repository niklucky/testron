import { expect, it } from 'vitest';
import { parsePlaywright } from '@testron/domain/codegen/parse-playwright';
import { presentRecordedSteps, presentSource } from '../../src/components/features/record/live';

it('maps same-line and multiline statements to their actual starting lines', () => {
  const source = [
    "import { test } from '@playwright/test';",
    "test('formatting', async ({ page }) => { await page.goto('https://example.test');",
    'const value = [',
    "  'hello',",
    '];',
    "await page.getByLabel('Name').fill(value[0]); await page.getByText('Save').click();",
    "await page.getByText('Next').click();",
    '});',
  ].join('\n');
  const parsed = parsePlaywright(source);
  expect(parsed.error).toBeUndefined();
  expect(parsed.steps).toHaveLength(5);
  const steps = presentRecordedSteps(parsed.steps.map(({ step }) => step));
  const lines = presentSource(source, steps);
  expect(lines.map(({ text }) => text).join('\n')).toBe(source);
  expect(lines.map(({ stepId }) => stepId)).toEqual([
    undefined,
    steps[0].id,
    steps[1].id,
    undefined,
    undefined,
    steps[2].id,
    steps[4].id,
    undefined,
  ]);
});
