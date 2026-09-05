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
    case 'id':
      return `page.locator(${quote(`[id=${quote(locator.value)}]`)})`;
    case 'name':
      return `page.locator(${quote(`[name=${quote(locator.value)}]`)})`;
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
  const hasAssertions = steps.some(
    (step) =>
      step.kind.startsWith('assert') || (step.kind === 'code' && /\bexpect\s*\(/.test(step.code)),
  );
  const hasVariables = steps.some((step) => step.kind === 'fill' && step.variable);
  const body = steps.map((step) => {
    switch (step.kind) {
      case 'navigate':
        return `  await page.goto(${quote(step.url)});`;
      case 'click':
        return `  await ${generateLocator(step.target.primary)}.click();`;
      case 'hover':
        return `  await ${generateLocator(step.target.primary)}.hover();`;
      case 'fill':
        return `  await ${generateLocator(step.target.primary)}.fill(${
          step.variable ? `requiredEnv(${quote(step.variable.name)})` : quote(step.value)
        });`;
      case 'selectOption':
        return `  await ${generateLocator(step.target.primary)}.selectOption(${quote(step.value)});`;
      case 'check':
        return `  await ${generateLocator(step.target.primary)}.check();`;
      case 'uncheck':
        return `  await ${generateLocator(step.target.primary)}.uncheck();`;
      case 'press':
        return `  await ${generateLocator(step.target.primary)}.press(${quote(step.key)});`;
      case 'assertElement': {
        const locator = generateLocator(step.target.primary);
        switch (step.assertion.type) {
          case 'visible':
            return `  await expect(${locator}).toBeVisible();`;
          case 'hidden':
            return `  await expect(${locator}).toBeHidden();`;
          case 'enabled':
            return `  await expect(${locator}).toBeEnabled();`;
          case 'disabled':
            return `  await expect(${locator}).toBeDisabled();`;
          case 'checked':
            return `  await expect(${locator}).toBeChecked();`;
          case 'unchecked':
            return `  await expect(${locator}).not.toBeChecked();`;
          case 'text':
            return step.assertion.match === 'equals'
              ? `  await expect(${locator}).toHaveText(${quote(step.assertion.expected)});`
              : `  await expect(${locator}).toContainText(${quote(step.assertion.expected)});`;
          case 'value':
            return `  await expect(${locator}).toHaveValue(${quote(step.assertion.expected)});`;
          case 'attribute':
            return `  await expect(${locator}).toHaveAttribute(${quote(step.assertion.name)}, ${quote(step.assertion.expected)});`;
          case 'class':
            return `  await expect(${locator}).toHaveClass(${quote(step.assertion.expected)});`;
          case 'count':
            return step.assertion.operator === 'equals'
              ? `  await expect(${locator}).toHaveCount(${step.assertion.expected});`
              : `  await expect.poll(() => ${locator}.count()).toBeGreaterThanOrEqual(${step.assertion.expected});`;
        }
        throw new Error('Unsupported assertion type.');
      }
      case 'assertUrlPath':
        return `  await expect(page).toHaveURL((url) => url.pathname === ${quote(step.expected)});`;
      case 'code':
        return step.code
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n');
    }
  });

  return [
    `import { test${hasAssertions ? ', expect' : ''} } from '@playwright/test';`,
    ...(hasVariables
      ? [
          '',
          'const requiredEnv = (name: string): string => {',
          '  const value = process.env[name];',
          '  if (!value) throw new Error(`Missing required environment variable: ${name}`);',
          '  return value;',
          '};',
        ]
      : []),
    '',
    `test(${quote(title)}, async ({ page }) => {`,
    ...body,
    '});',
    '',
  ].join('\n');
};
