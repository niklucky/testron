import { describe, expect, it } from 'vitest';

import { rankLocators } from '../../src/domain/locators/schema';

describe('locator ranking', () => {
  it('uses a stable semantic order and removes duplicates', () => {
    const css = { strategy: 'css' as const, selector: 'form > button', fragile: true as const };
    expect(
      rankLocators([
        css,
        { strategy: 'text', text: 'Continue' },
        { strategy: 'role', role: 'button', name: 'Continue' },
        { strategy: 'testId', attribute: 'data-testid', value: 'continue' },
        css,
      ]).map((locator) => locator.strategy),
    ).toEqual(['testId', 'role', 'text', 'css']);
  });
});
