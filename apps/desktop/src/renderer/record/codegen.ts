import {
  numberComparisons,
  isNumberComparison,
  numericAssertionSource,
} from '@testron/domain/steps/numbers';
import { session } from './data';
import type { RecordedStep } from './types';

/**
 * Presentation helpers for fixture mode and manual descriptions. Hosted
 * recordings use the canonical Playwright source from the main process.
 */

const quote = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const attributeNameFor = (step: RecordedStep): string =>
  step.assertionAttributeName?.trim() || 'data-testid';

type Translate = (key: string, values?: Record<string, string | number>) => string;

const translated = (
  translate: Translate | undefined,
  key: string,
  fallback: string,
  values?: Record<string, string | number>,
) => (translate ? translate(key, values) : fallback);

/** The manual-test line: verb, quoted subject, and the value if there is one. */
export const sentence = (step: RecordedStep, translate?: Translate): string => {
  switch (step.kind) {
    case 'code':
      return `Run this Playwright code manually: ${step.value ?? ''}`;
    case 'navigate':
      return translated(translate, 'step_open_url', `Open ${step.url}`, { value1: step.url ?? '' });
    case 'click':
      return translated(translate, 'step_click_target', `Click “${step.label}”`, {
        value1: step.label,
      });
    case 'hover':
      return translated(translate, 'step_hover_target', `Hover over “${step.label}”`, {
        value1: step.label,
      });
    case 'fill':
      return step.secret
        ? translated(
            translate,
            'step_fill_target_with_variable',
            `Fill “${step.label}” with {{${step.secret}}}`,
            { value1: step.label, value2: `{{${step.secret}}}` },
          )
        : translated(
            translate,
            'step_fill_target_with_value',
            `Fill “${step.label}” with “${step.value ?? ''}”`,
            { value1: step.label, value2: step.value ?? '' },
          );
    case 'select':
      return translated(
        translate,
        'step_select_value_in_target',
        `Select “${step.value ?? ''}” in “${step.label}”`,
        { value1: step.value ?? '', value2: step.label },
      );
    case 'check':
      return translated(translate, 'step_check_target', `Check “${step.label}”`, {
        value1: step.label,
      });
    case 'uncheck':
      return translated(translate, 'step_uncheck_target', `Uncheck “${step.label}”`, {
        value1: step.label,
      });
    case 'press':
      return translated(
        translate,
        'step_press_key_in_target',
        `Press ${step.value ?? 'Enter'} in “${step.label}”`,
        { value1: step.value ?? 'Enter', value2: step.label },
      );
    case 'assertUrl':
      return translated(
        translate,
        'step_expect_page_at_path',
        `Expect the page to be at ${step.value ?? '/'}`,
        { value1: step.value ?? '/' },
      );
    case 'assert':
      if (isNumberComparison(step.assertion))
        return `Expect “${step.label}” ${numberComparisons[step.assertion].label.toLowerCase()} ${step.value ?? '0'}`;
      switch (step.assertion) {
        case 'textContains':
          return translated(
            translate,
            'step_expect_target_to_contain',
            `Expect “${step.label}” to contain “${step.value ?? ''}”`,
            { value1: step.label, value2: step.value ?? '' },
          );
        case 'textEquals':
          return translated(
            translate,
            'step_expect_target_to_read',
            `Expect “${step.label}” to read “${step.value ?? ''}”`,
            { value1: step.label, value2: step.value ?? '' },
          );
        case 'value':
          return translated(
            translate,
            'step_expect_target_to_hold',
            `Expect “${step.label}” to hold “${step.value ?? ''}”`,
            { value1: step.label, value2: step.value ?? '' },
          );
        case 'attribute': {
          const attributeName = attributeNameFor(step);
          return translated(
            translate,
            'step_expect_target_attribute',
            `Expect “${step.label}” to have ${attributeName} “${step.value ?? ''}”`,
            { value1: step.label, value2: `${attributeName}=${step.value ?? ''}` },
          );
        }
        case 'class':
          return translated(
            translate,
            'step_expect_target_class',
            `Expect “${step.label}” to have class “${step.value ?? ''}”`,
            { value1: step.label, value2: step.value ?? '' },
          );
        case 'enabled':
          return translated(
            translate,
            'step_expect_target_enabled',
            `Expect “${step.label}” to be enabled`,
            { value1: step.label },
          );
        case 'disabled':
          return translated(
            translate,
            'step_expect_target_disabled',
            `Expect “${step.label}” to be disabled`,
            { value1: step.label },
          );
        case 'checked':
          return translated(
            translate,
            'step_expect_target_checked',
            `Expect “${step.label}” to be checked`,
            { value1: step.label },
          );
        case 'unchecked':
          return translated(
            translate,
            'step_expect_target_unchecked',
            `Expect “${step.label}” to be unchecked`,
            { value1: step.label },
          );
        case 'countExactly':
          return translated(
            translate,
            'step_expect_target_exact_count',
            `Expect “${step.label}” to have exactly ${step.value ?? '0'} matches`,
            { value1: step.label, value2: step.value ?? '0' },
          );
        case 'countAtLeast':
          return translated(
            translate,
            'step_expect_target_min_count',
            `Expect “${step.label}” to have at least ${step.value ?? '0'} matches`,
            { value1: step.label, value2: step.value ?? '0' },
          );
        case 'hidden':
          return translated(
            translate,
            'step_expect_target_hidden',
            `Expect “${step.label}” to be hidden`,
            { value1: step.label },
          );
        default:
          return translated(
            translate,
            'step_expect_target_visible',
            `Expect “${step.label}” to be visible`,
            { value1: step.label },
          );
      }
  }
};

/** The Playwright call, indented for the body of a `test()`. */
const call = (step: RecordedStep): string => {
  const target = `page.${step.locator}`;
  switch (step.kind) {
    case 'code':
      return step.value ?? '';
    case 'navigate':
      return `await page.goto(${quote(step.url ?? '/')});`;
    case 'click':
      return `await ${target}.click();`;
    case 'hover':
      return `await ${target}.hover();`;
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
      if (isNumberComparison(step.assertion))
        return numericAssertionSource(
          target,
          numberComparisons[step.assertion].operator,
          Number(step.value ?? 0),
        );
      switch (step.assertion) {
        case 'textEquals':
          return `await expect(${target}).toHaveText(${quote(step.value ?? '')});`;
        case 'textContains':
          return `await expect(${target}).toContainText(${quote(step.value ?? '')});`;
        case 'value':
          return `await expect(${target}).toHaveValue(${quote(step.value ?? '')});`;
        case 'attribute':
          return `await expect(${target}).toHaveAttribute(${quote(attributeNameFor(step))}, ${quote(step.value ?? '')});`;
        case 'class':
          return `await expect(${target}).toHaveClass(${quote(step.value ?? '')});`;
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
