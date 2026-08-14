import type { Locator } from '../locators/schema';
import type { Step } from '../steps/schema';

const quote = (value: string): string =>
  `'${value
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
    .replaceAll('\r', '\\r')
    .replaceAll('\n', '\\n')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')}'`;

export const generateLocator = (locator: Locator): string => {
  switch (locator.strategy) {
    case 'testId':
      return locator.attribute === 'data-testid'
        ? `page.getByTestId(${quote(locator.value)})`
        : `page.locator(${quote(`[${locator.attribute}=${quote(locator.value)}]`)})`;
    case 'role':
      return `page.getByRole(${quote(locator.role)}, { name: ${quote(locator.name)} })`;
    case 'label':
      return `page.getByLabel(${quote(locator.text)})`;
    case 'placeholder':
      return `page.getByPlaceholder(${quote(locator.text)})`;
    case 'text':
      return `page.getByText(${quote(locator.text)}, { exact: true })`;
    case 'css':
      return `page.locator(${quote(locator.selector)})`;
  }
};

export const generatePlaywright = (title: string, steps: readonly Step[]): string => {
  const body = steps.map((step) => {
    switch (step.kind) {
      case 'navigate':
        return `  await page.goto(${quote(step.url)});`;
      case 'click':
        return `  await ${generateLocator(step.target.primary)}.click();`;
      case 'fill':
        return `  await ${generateLocator(step.target.primary)}.fill(${quote(step.value)});`;
    }
  });

  return [
    `import { test, expect } from '@playwright/test';`,
    '',
    `test(${quote(title)}, async ({ page }) => {`,
    ...body,
    `  await expect(page).toHaveURL(/\\/welcome$/);`,
    '});',
    '',
  ].join('\n');
};
