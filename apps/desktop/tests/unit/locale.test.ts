import { describe, expect, it } from 'vitest';

import { resolveSystemLocale } from '../../src/main/locale';

describe('desktop system locale selection', () => {
  it('uses the first supported preferred system language', () => {
    expect(resolveSystemLocale(['de-DE', 'ru-RU', 'en-US'])).toBe('ru');
    expect(resolveSystemLocale(['en-GB', 'ru-RU'])).toBe('en');
  });

  it('falls back to English when the system languages are unsupported', () => {
    expect(resolveSystemLocale(['de-DE', 'fr-FR'])).toBe('en');
  });
});
