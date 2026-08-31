import { negotiateLocale } from '@warpunit/slang-react';

export const supportedLocales = ['en', 'ru'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

export const resolveSystemLocale = (preferredLanguages: readonly string[]): SupportedLocale =>
  negotiateLocale(supportedLocales, preferredLanguages, 'en');
