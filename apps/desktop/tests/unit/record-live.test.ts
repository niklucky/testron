import { describe, expect, it } from 'vitest';

import type { Step } from '@testron/domain/steps/schema';
import { ru } from '@testron/i18n';
import { sentence } from '../../src/renderer/record/codegen';
import { presentRecordedSteps, presentSource } from '../../src/renderer/record/live';

const at = '2026-08-16T10:00:00.000Z';

describe('live record presentation', () => {
  it('preserves literal password fills, assertions, and locator alternatives', () => {
    const steps: Step[] = [
      {
        version: 1,
        kind: 'fill',
        target: {
          primary: { strategy: 'label', text: 'Password' },
          alternatives: [{ strategy: 'testId', attribute: 'data-testid', value: 'password' }],
        },
        value: 'test',
        metadata: { recordedAt: at },
      },
      {
        version: 1,
        kind: 'assertElement',
        target: {
          primary: { strategy: 'role', role: 'status', name: 'Signed in' },
          alternatives: [],
        },
        assertion: { type: 'text', match: 'contains', expected: 'Welcome' },
        metadata: { recordedAt: '2026-08-16T10:00:02.000Z' },
      },
      {
        version: 1,
        kind: 'uncheck',
        target: {
          primary: { strategy: 'label', text: 'Remember me' },
          alternatives: [],
        },
        metadata: { recordedAt: '2026-08-16T10:00:03.000Z' },
      },
    ];

    expect(presentRecordedSteps(steps)).toMatchObject([
      {
        kind: 'fill',
        label: 'Password',
        locator: "getByLabel('Password')",
        alternatives: ["getByTestId('password')"],
        value: 'test',
        at: 0,
      },
      { kind: 'assert', assertion: 'textContains', value: 'Welcome', at: 2 },
      { kind: 'uncheck', at: 3 },
    ]);
  });

  it('presents id and name locators emitted when Tab commits a real login field', () => {
    const displayed = presentRecordedSteps([
      {
        version: 1,
        kind: 'fill',
        target: {
          primary: { strategy: 'id', value: 'username' },
          alternatives: [{ strategy: 'name', value: 'username' }],
        },
        value: 'Administrator',
        metadata: { recordedAt: at },
      },
      {
        version: 1,
        kind: 'press',
        target: {
          primary: { strategy: 'id', value: 'username' },
          alternatives: [{ strategy: 'name', value: 'username' }],
        },
        key: 'Tab',
        metadata: { recordedAt: '2026-08-16T10:00:01.000Z' },
      },
    ]);

    expect(displayed).toMatchObject([
      {
        kind: 'fill',
        locator: "locator('[id=\\'username\\']')",
        alternatives: ["locator('[name=\\'username\\']')"],
        value: 'Administrator',
      },
      {
        kind: 'press',
        locator: "locator('[id=\\'username\\']')",
        alternatives: ["locator('[name=\\'username\\']')"],
        value: 'Tab',
      },
    ]);
  });

  it('tags canonical generated action lines without replacing backend source', () => {
    const displayed = presentRecordedSteps([
      {
        version: 1,
        kind: 'navigate',
        url: 'https://example.test/',
        metadata: { recordedAt: at },
      },
    ]);
    const source = [
      "import { test } from '@playwright/test';",
      '',
      "test('visit', async ({ page }) => {",
      "  await page.goto('https://example.test/');",
      '});',
      '',
    ].join('\n');

    const lines = presentSource(source, displayed);
    expect(lines.map((line) => line.text).join('\n')).toBe(source.trimEnd());
    expect(lines[3].stepId).toBe(displayed[0].id);
  });

  it('presents collection count assertions with editable numeric values', () => {
    const displayed = presentRecordedSteps([
      {
        version: 1,
        kind: 'assertElement',
        target: {
          primary: { strategy: 'css', selector: 'table > tbody > tr', fragile: true },
          alternatives: [],
        },
        assertion: { type: 'count', operator: 'atLeast', expected: 20 },
        metadata: { recordedAt: at },
      },
    ]);

    expect(displayed).toMatchObject([{ kind: 'assert', assertion: 'countAtLeast', value: '20' }]);
  });

  it('localizes manual step descriptions without changing their recorded values', () => {
    const displayed = presentRecordedSteps([
      {
        version: 1,
        kind: 'fill',
        target: {
          primary: { strategy: 'label', text: 'Email' },
          alternatives: [],
        },
        value: 'qa@example.test',
        metadata: { recordedAt: at },
      },
      {
        version: 1,
        kind: 'assertElement',
        target: {
          primary: { strategy: 'role', role: 'status', name: 'Signed in' },
          alternatives: [],
        },
        assertion: { type: 'visible' },
        metadata: { recordedAt: '2026-08-16T10:00:01.000Z' },
      },
    ]);
    const translate = (key: string, values: Record<string, string | number> = {}) =>
      Object.entries(values).reduce(
        (text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)),
        (ru as Record<string, string>)[key] ?? key,
      );

    expect(displayed.map((step) => sentence(step, translate))).toEqual([
      'Ввести «qa@example.test» в поле «Email»',
      'Проверить, что «Signed in» виден',
    ]);
  });
});
