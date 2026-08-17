import { describe, expect, it } from 'vitest';

import { parseLocatorInput, replacePrimaryLocator } from '../../src/renderer/record/locator-edit';

describe('locator editing', () => {
  it('accepts semantic Playwright locators and concise shorthands', () => {
    expect(parseLocatorInput("getByRole('menuitem', { name: 'Dashboard' })")).toEqual({
      strategy: 'role',
      role: 'menuitem',
      name: 'Dashboard',
    });
    expect(parseLocatorInput('testId=company-menu')).toEqual({
      strategy: 'testId',
      attribute: 'data-testid',
      value: 'company-menu',
    });
    expect(parseLocatorInput('button.company')).toEqual({
      strategy: 'css',
      selector: 'button.company',
      fragile: true,
    });
  });

  it('promotes a recorded alternative and retains the old primary', () => {
    expect(
      replacePrimaryLocator(
        {
          primary: { strategy: 'css', selector: 'div > div > button', fragile: true },
          alternatives: [{ strategy: 'text', text: 'Companies' }],
        },
        "getByText('Companies', { exact: true })",
      ),
    ).toEqual({
      primary: { strategy: 'text', text: 'Companies' },
      alternatives: [{ strategy: 'css', selector: 'div > div > button', fragile: true }],
    });
  });
});
