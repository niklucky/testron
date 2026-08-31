import { negotiateLocale } from '@warpunit/slang-react';

export const supportedLocales = ['en', 'ru'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

const isSupportedLocale = (locale: string | null): locale is SupportedLocale =>
  locale !== null && supportedLocales.some((supported) => supported === locale);

export const resolveBrowserLocale = (
  storedLocale: string | null,
  browserLanguages: readonly string[],
): SupportedLocale =>
  isSupportedLocale(storedLocale)
    ? storedLocale
    : negotiateLocale(supportedLocales, browserLanguages, 'en');
