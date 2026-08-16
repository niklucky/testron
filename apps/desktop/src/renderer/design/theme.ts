import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'testron-theme';

const stored = (): Theme => (localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark');

/**
 * The theme lives on <html data-theme>, not on a React context: tokens.css
 * keys off that attribute, so one write repaints every surface — including
 * anything rendered outside the React tree, like a native scrollbar.
 */
export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(stored);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = useCallback(
    () => setTheme((current) => (current === 'dark' ? 'light' : 'dark')),
    [],
  );

  return { theme, setTheme, toggle };
};
