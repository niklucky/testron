import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';
export type ThemePreference = Theme | 'system';

const STORAGE_KEY = 'testron-theme';

const stored = (): ThemePreference => {
  const hostTheme = new URLSearchParams(window.location.search).get('theme');
  if (hostTheme === 'dark' || hostTheme === 'light') return hostTheme;
  const value = localStorage.getItem(STORAGE_KEY);
  return value === 'light' || value === 'system' ? value : 'dark';
};

const systemTheme = (): Theme =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

/**
 * The theme lives on <html data-theme>, not on a React context: tokens.css
 * keys off that attribute, so one write repaints every surface — including
 * anything rendered outside the React tree, like a native scrollbar.
 */
export const useTheme = () => {
  const [preference, setPreference] = useState<ThemePreference>(stored);
  const [theme, setResolvedTheme] = useState<Theme>(() =>
    stored() === 'system' ? systemTheme() : (stored() as Theme),
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
      setResolvedTheme(resolved);
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    localStorage.setItem(STORAGE_KEY, preference);
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preference]);

  const toggle = useCallback(
    () => setPreference((current) => (current === 'dark' ? 'light' : 'dark')),
    [],
  );

  return { theme, preference, setTheme: setPreference, toggle };
};
