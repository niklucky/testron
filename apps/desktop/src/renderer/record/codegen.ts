import { session } from './data';
import type { RecordedStep } from './types';

/**
 * One take, two readings. Both panels are generated from the same step list —
 * the left one for a human who has to run this by hand, the right one for
 * Playwright — so a step can never say two different things.
 */

const quote = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** The pseudo-code line: verb, quoted subject, and the value if there is one. */
export const sentence = (step: RecordedStep): string => {
  switch (step.kind) {
    case 'navigate':
      return `Open ${step.url}`;
    case 'click':
      return `Click “${step.label}”`;
    case 'fill':
      return step.secret
        ? `Fill “${step.label}” with {{${step.secret}}}`
        : `Fill “${step.label}” with “${step.value ?? ''}”`;
    case 'select':
      return `Select “${step.value ?? ''}” in “${step.label}”`;
    case 'check':
      return `Check “${step.label}”`;
    case 'uncheck':
      return `Uncheck “${step.label}”`;
    case 'press':
      return `Press ${step.value ?? 'Enter'} in “${step.label}”`;
    case 'assertUrl':
      return `Expect the page to be at ${step.value ?? '/'}`;
    case 'assert':
      switch (step.assertion) {
        case 'textContains':
          return `Expect “${step.label}” to contain “${step.value ?? ''}”`;
        case 'textEquals':
          return `Expect “${step.label}” to read “${step.value ?? ''}”`;
        case 'value':
          return `Expect “${step.label}” to hold “${step.value ?? ''}”`;
        case 'enabled':
          return `Expect “${step.label}” to be enabled`;
        case 'disabled':
          return `Expect “${step.label}” to be disabled`;
        case 'checked':
          return `Expect “${step.label}” to be checked`;
        case 'unchecked':
          return `Expect “${step.label}” to be unchecked`;
        case 'countExactly':
          return `Expect “${step.label}” to have exactly ${step.value ?? '0'} matches`;
        case 'countAtLeast':
          return `Expect “${step.label}” to have at least ${step.value ?? '0'} matches`;
        case 'hidden':
          return `Expect “${step.label}” to be hidden`;
        default:
          return `Expect “${step.label}” to be visible`;
      }
  }
};

/** The Playwright call, indented for the body of a `test()`. */
const call = (step: RecordedStep): string => {
  const target = `page.${step.locator}`;
  switch (step.kind) {
    case 'navigate':
      return `await page.goto(${quote(step.url ?? '/')});`;
    case 'click':
      return `await ${target}.click();`;
    case 'fill':
      return step.secret
        ? `await ${target}.fill(requiredEnv(${quote(step.secret)}));`
        : `await ${target}.fill(${quote(step.value ?? '')});`;
    case 'select':
      return `await ${target}.selectOption(${quote(step.value ?? '')});`;
    case 'check':
      return `await ${target}.check();`;
    case 'uncheck':
      return `await ${target}.uncheck();`;
    case 'press':
      return `await ${target}.press(${quote(step.value ?? 'Enter')});`;
    case 'assertUrl':
      return `await expect(page).toHaveURL(${quote(step.value ?? '/')});`;
    case 'assert':
      switch (step.assertion) {
        case 'textEquals':
          return `await expect(${target}).toHaveText(${quote(step.value ?? '')});`;
        case 'textContains':
          return `await expect(${target}).toContainText(${quote(step.value ?? '')});`;
        case 'value':
          return `await expect(${target}).toHaveValue(${quote(step.value ?? '')});`;
        case 'enabled':
          return `await expect(${target}).toBeEnabled();`;
        case 'disabled':
          return `await expect(${target}).toBeDisabled();`;
        case 'checked':
          return `await expect(${target}).toBeChecked();`;
        case 'unchecked':
          return `await expect(${target}).not.toBeChecked();`;
        case 'countExactly':
          return `await expect(${target}).toHaveCount(${Number(step.value ?? 0)});`;
        case 'countAtLeast':
          return `await expect.poll(() => ${target}.count()).toBeGreaterThanOrEqual(${Number(step.value ?? 0)});`;
        case 'hidden':
          return `await expect(${target}).toBeHidden();`;
        default:
          return `await expect(${target}).toBeVisible();`;
      }
  }
};

/** A source line, tagged with the step that produced it. */
export type CodeLine = { text: string; stepId?: string };

export const buildSource = (steps: RecordedStep[]): CodeLine[] => {
  const lines: CodeLine[] = [
    { text: "import { expect, test } from '@playwright/test';" },
    { text: '' },
    { text: `test(${quote(session.test)}, async ({ page }) => {` },
  ];

  if (steps.length === 0) {
    lines.push({ text: '  // Nothing recorded yet.' });
  }

  for (const step of steps) {
    if (step.warning) lines.push({ text: `  // ${step.warning}`, stepId: step.id });
    lines.push({ text: `  ${call(step)}`, stepId: step.id });
  }

  lines.push({ text: '});' });
  return lines;
};

export const sourceText = (lines: CodeLine[]) => lines.map((line) => line.text).join('\n');

/** mm:ss, because a recording is never long enough to need an hour field. */
export const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
