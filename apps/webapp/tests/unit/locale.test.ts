import { describe, expect, it } from 'vitest';

import { resolveBrowserLocale } from '../../src/lib/locale';

describe('browser locale selection', () => {
  it('keeps a supported stored choice', () => {
    expect(resolveBrowserLocale('en', ['ru-RU'])).toBe('en');
    expect(resolveBrowserLocale('ru', ['en-US'])).toBe('ru');
  });

  it('uses the ranked browser language list when no choice is stored', () => {
    expect(resolveBrowserLocale(null, ['de-DE', 'ru-RU', 'en-US'])).toBe('ru');
    expect(resolveBrowserLocale(null, ['en-GB', 'ru-RU'])).toBe('en');
  });

  it('falls back to English for unsupported preferences and stale storage', () => {
    expect(resolveBrowserLocale(null, ['de-DE'])).toBe('en');
    expect(resolveBrowserLocale('de', ['de-DE'])).toBe('en');
  });
});
