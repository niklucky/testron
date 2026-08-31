import { negotiateLocale } from '@warpunit/slang-react';
import { isSupportedLocale, supportedLocales, type SupportedLocale } from '@testron/i18n';

export const resolveBrowserLocale = (
  storedLocale: string | null,
  browserLanguages: readonly string[],
): SupportedLocale =>
  isSupportedLocale(storedLocale)
    ? storedLocale
    : negotiateLocale(supportedLocales, browserLanguages, 'en');
