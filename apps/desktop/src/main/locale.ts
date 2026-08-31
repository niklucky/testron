import { negotiateLocale } from '@warpunit/slang-react';
import { supportedLocales, type SupportedLocale } from '@testron/i18n';

export const resolveSystemLocale = (preferredLanguages: readonly string[]): SupportedLocale =>
  negotiateLocale(supportedLocales, preferredLanguages, 'en');
