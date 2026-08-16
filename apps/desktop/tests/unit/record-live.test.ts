import { describe, expect, it } from 'vitest';

import type { Step } from '@testron/domain/steps/schema';
import { presentRecordedSteps, presentSource } from '../../src/renderer/record/live';

const at = '2026-08-16T10:00:00.000Z';

describe('live record presentation', () => {
  it('preserves domain actions, assertions, secrets, and locator alternatives', () => {
    const steps: Step[] = [
      {
        version: 1,
        kind: 'fill',
        target: {
          primary: { strategy: 'label', text: 'Password' },
          alternatives: [{ strategy: 'testId', attribute: 'data-testid', value: 'password' }],
        },
        value: '',
        secret: { environmentVariable: 'PASSWORD' },
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
        secret: 'PASSWORD',
        at: 0,
      },
      { kind: 'assert', assertion: 'textContains', value: 'Welcome', at: 2 },
      { kind: 'uncheck', at: 3 },
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
});
