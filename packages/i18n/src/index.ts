import en from './en.json';
import ru from './ru.json';

export { en, ru };
export const resources = { en, ru } as const;
export const supportedLocales = ['en', 'ru'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

export const isSupportedLocale = (locale: string | null | undefined): locale is SupportedLocale =>
  locale !== null &&
  locale !== undefined &&
  supportedLocales.some((supported) => supported === locale);
