import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { generatePlaywright } from '../../src/domain/codegen/playwright';
import type { Step } from '../../src/domain/steps/schema';
import { loginSteps } from '../fixtures/login-steps';

describe('Playwright generation', () => {
  it('deterministically produces the replayed fixture spec', () => {
    const checkedInSpec = readFileSync(
      join(process.cwd(), 'tests/generated/login.spec.ts'),
      'utf8',
    );
    expect(generatePlaywright('recorded login flow', loginSteps)).toBe(checkedInSpec);
  });

  it('generates Playwright for every Phase 1 action', () => {
    const metadata = { recordedAt: '2026-01-01T00:00:00.000Z' };
    const target = {
      primary: { strategy: 'testId' as const, attribute: 'data-qa', value: 'control' },
      alternatives: [],
    };
    const steps: Step[] = [
      { version: 1, kind: 'selectOption', target, value: 'one', metadata },
      { version: 1, kind: 'check', target, metadata },
      { version: 1, kind: 'uncheck', target, metadata },
      { version: 1, kind: 'press', target, key: 'Enter', metadata },
    ];
    const source = generatePlaywright('phase 1 actions', steps);
    expect(source).toContain("page.locator('[data-qa=\\'control\\']').selectOption('one')");
    expect(source).toContain("page.locator('[data-qa=\\'control\\']').check()");
    expect(source).toContain("page.locator('[data-qa=\\'control\\']').uncheck()");
    expect(source).toContain("page.locator('[data-qa=\\'control\\']').press('Enter')");
  });

  it('generates all Phase 2 assertions and keeps secrets out of source', () => {
    const metadata = { recordedAt: '2026-01-01T00:00:00.000Z' };
    const target = {
      primary: { strategy: 'testId' as const, attribute: 'data-testid', value: 'control' },
      alternatives: [],
    };
    const steps: Step[] = [
      {
        version: 1,
        kind: 'fill',
        target,
        value: '',
        secret: { environmentVariable: 'TESTRON_PASSWORD' },
        metadata,
      },
      { version: 1, kind: 'assertElement', target, assertion: { type: 'visible' }, metadata },
      { version: 1, kind: 'assertElement', target, assertion: { type: 'hidden' }, metadata },
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
        assertion: { type: 'text', match: 'equals', expected: 'Ready now' },
        metadata,
      },
      {
        version: 1,
        kind: 'assertElement',
        target,
        assertion: { type: 'value', expected: 'yes' },
        metadata,
      },
      { version: 1, kind: 'assertElement', target, assertion: { type: 'enabled' }, metadata },
      { version: 1, kind: 'assertElement', target, assertion: { type: 'disabled' }, metadata },
      { version: 1, kind: 'assertElement', target, assertion: { type: 'checked' }, metadata },
      { version: 1, kind: 'assertElement', target, assertion: { type: 'unchecked' }, metadata },
      { version: 1, kind: 'assertUrlPath', expected: '/welcome', metadata },
    ];
    const source = generatePlaywright('trustworthy test', steps);
    expect(source).toContain("requiredEnv('TESTRON_PASSWORD')");
    expect(source).not.toContain('actual-password');
    expect(source).toContain('.toBeVisible()');
    expect(source).toContain('.toBeHidden()');
    expect(source).toContain(".toContainText('Ready')");
    expect(source).toContain(".toHaveText('Ready now')");
    expect(source).toContain(".toHaveValue('yes')");
    expect(source).toContain('.toBeEnabled()');
    expect(source).toContain('.toBeDisabled()');
    expect(source).toContain('.toBeChecked()');
    expect(source).toContain('.not.toBeChecked()');
    expect(source).toContain("url.pathname === '/welcome'");
  });
});
