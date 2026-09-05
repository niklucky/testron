import { describe, expect, it } from 'vitest';

import {
  parsePlaywright,
  appendPlaywrightStepSource,
  playwrightReplayError,
  renamePlaywrightTestSource,
  rewritePlaywrightSteps,
} from '../../src/codegen/parse-playwright';
import { generatePlaywright } from '../../src/codegen/playwright';
import type { Step } from '../../src/steps/schema';

const metadata = { recordedAt: '2026-01-01T00:00:00.000Z' };
const target = {
  primary: { strategy: 'testId' as const, attribute: 'data-testid', value: 'control' },
  alternatives: [],
};

const withoutMetadata = (step: Step) => {
  const result = structuredClone(step) as Partial<Step>;
  delete result.metadata;
  return result;
};

describe('Playwright parsing', () => {
  it('round trips every generated step through source', () => {
    const steps: Step[] = [
      { version: 1, kind: 'navigate', url: 'https://example.com/start', metadata },
      { version: 1, kind: 'click', target, metadata },
      { version: 1, kind: 'hover', target, metadata },
      { version: 1, kind: 'fill', target, value: 'hello', metadata },
      { version: 1, kind: 'fill', target, value: '', variable: { name: 'EMAIL' }, metadata },
      { version: 1, kind: 'selectOption', target, value: 'one', metadata },
      { version: 1, kind: 'check', target, metadata },
      { version: 1, kind: 'uncheck', target, metadata },
      { version: 1, kind: 'press', target, key: 'Enter', metadata },
      ...(['visible', 'hidden', 'enabled', 'disabled', 'checked', 'unchecked'] as const).map(
        (type): Step => ({
          version: 1,
          kind: 'assertElement',
          target,
          assertion: { type },
          metadata,
        }),
      ),
      {
        version: 1,
        kind: 'assertElement',
        target,
        assertion: { type: 'text', match: 'equals', expected: 'Ready' },
        metadata,
      },
      {
        version: 1,
        kind: 'assertElement',
        target,
        assertion: { type: 'text', match: 'contains', expected: 'Ready' },
        metadata,
      },
      {
        version: 1,
        kind: 'assertElement',
        target,
        assertion: { type: 'value', expected: 'yes' },
        metadata,
      },
      {
        version: 1,
        kind: 'assertElement',
        target,
        assertion: { type: 'attribute', name: 'data-state', expected: 'open' },
        metadata,
      },
      {
        version: 1,
        kind: 'assertElement',
        target,
        assertion: { type: 'class', expected: 'active' },
        metadata,
      },
      {
        version: 1,
        kind: 'assertElement',
        target,
        assertion: { type: 'count', operator: 'equals', expected: 2 },
        metadata,
      },
      {
        version: 1,
        kind: 'assertElement',
        target,
        assertion: { type: 'count', operator: 'atLeast', expected: 2 },
        metadata,
      },
      { version: 1, kind: 'assertUrlPath', expected: '/done', metadata },
    ];
    const parsed = parsePlaywright(generatePlaywright('round trip', steps));
    expect(parsed.error).toBeUndefined();
    expect(parsed.title).toBe('round trip');
    expect(parsed.steps.map(({ step }) => withoutMetadata(step))).toEqual(
      steps.map(withoutMetadata),
    );
  });

  it('preserves a complex condition as one exact code step', () => {
    const statement =
      "if (await page.getByText('Cookies').isVisible()) {\n    await page.getByText('Cookies').click();\n  }";
    const parsed = parsePlaywright(
      `import { test } from '@playwright/test';\n\ntest('custom', async ({ page }) => {\n  ${statement}\n});\n`,
    );
    expect(parsed.error).toBeUndefined();
    expect(parsed.steps).toHaveLength(1);
    expect(parsed.steps[0]?.step).toMatchObject({ kind: 'code', code: statement });
  });

  it('falls back when Playwright options would change structured-step behavior', () => {
    const parsed = parsePlaywright(`import { test } from '@playwright/test';

test('options', async ({ page }) => {
  await page.getByText('Delete', { exact: true }).click({ force: true });
});
`);
    expect(parsed.steps[0]?.step).toMatchObject({ kind: 'code' });
  });

  it('does not replace valid steps when the source is syntactically incomplete', () => {
    expect(parsePlaywright("test('broken', async ({ page }) => {").error).toBeTruthy();
  });

  it('rewrites the test body without discarding file-level developer code', () => {
    const source = `import { test } from '@playwright/test';

const account = 'qa';

test('custom', async ({ page }) => {
  await page.getByText('Before', { exact: true }).click();
});
`;
    const parsed = parsePlaywright(source);
    const click = parsed.steps[0]!.step;
    expect(click.kind).toBe('click');
    if (click.kind !== 'click') throw new Error('Expected click');
    const rewritten = rewritePlaywrightSteps(source, [
      {
        ...click,
        target: {
          primary: { strategy: 'text', text: 'After' },
          alternatives: [],
        },
      },
    ]);
    expect(rewritten).toContain("const account = 'qa';");
    expect(rewritten).toContain("await page.getByText('After', { exact: true }).click();");
    expect(parsePlaywright(rewritten).steps[0]?.step).toMatchObject({
      kind: 'click',
      target: { primary: { strategy: 'text', text: 'After' } },
    });
  });

  it('keeps the source test title synchronized with title edits', () => {
    const source =
      "test('Before', async ({ page }) => {\n  await page.goto('https://example.com');\n});";
    const renamed = renamePlaywrightTestSource(source, "Customer's checkout");
    expect(renamed).toContain(`test("Customer's checkout"`);
    expect(parsePlaywright(renamed).title).toBe("Customer's checkout");
  });
});

describe('source review regressions', () => {
  it.each([
    "await page[method]('https://example.com');",
    "await page?.getByTestId('button').click();",
    "await expect(page).toHaveURL(url => url.hostname !== 'other');",
    "await page.getByText('Delete', { exact: true, ...options }).click();",
    "await page.getByRole('button', { [name]: 'Continue' }).click();",
    "await page.getByTestId('').click();",
    "await page.goto('/relative');",
    "await expect(page.getByTestId('row')).toHaveCount(1.5);",
  ])('keeps unsupported semantics as code: %s', (statement) => {
    const parsed = parsePlaywright(`test('review', async ({ page }) => { ${statement} });`);
    expect(parsed.error).toBeUndefined();
    expect(parsed.steps[0]?.step).toMatchObject({ kind: 'code', code: statement });
  });

  it('appends using the callback range without discarding helpers or relying on formatting', () => {
    const source = "const note = 'keep'; test('compact', async ({ page }) => {}); // keep too";
    const result = appendPlaywrightStepSource(source, {
      version: 1,
      kind: 'assertUrlPath',
      expected: '/done',
      metadata,
    });
    expect(result).toContain("const note = 'keep'");
    expect(result).toContain('// keep too');
    expect(result).toContain("import { expect } from '@playwright/test'");
    expect(parsePlaywright(result).steps[0]?.step.kind).toBe('assertUrlPath');
  });

  it('adds the requiredEnv helper when recording the first bound fill', () => {
    const source = generatePlaywright('empty', []);
    const result = appendPlaywrightStepSource(source, {
      version: 1,
      kind: 'fill',
      target,
      value: '',
      variable: { name: 'EMAIL' },
      metadata,
    });
    expect(result).toContain('const requiredEnv');
    expect(playwrightReplayError(result)).toBeUndefined();
  });

  it('rejects partial runs of invalid drafts, hooks, multiple tests, and changed fixtures', () => {
    expect(playwrightReplayError("test('draft',")).toContain('Fix');
    const source = generatePlaywright('test', []);
    expect(playwrightReplayError(source)).toBeUndefined();
    expect(playwrightReplayError(source + 'test.beforeEach(async () => {});')).toContain(
      'complete-spec',
    );
    expect(playwrightReplayError(source + "test('second', async ({ page }) => {});")).toBeTruthy();
    expect(playwrightReplayError(source.replace('{ page }', '{ page = customPage }'))).toBeTruthy();
  });
});

it('imports expect when appending a manual assertion', () => {
  const source = generatePlaywright('manual assertion', []);
  const step: Step = {
    version: 1,
    kind: 'code',
    code: 'expect(1 + 1).toBe(2);',
    reason: 'Manual assertion',
    metadata,
  };
  const updated = appendPlaywrightStepSource(source, step);
  expect(updated).toContain("import { expect } from '@playwright/test';");
  expect(updated).toContain(step.code);
  expect(appendPlaywrightStepSource(updated, step).match(/import \{ expect \}/g)).toHaveLength(1);
});
