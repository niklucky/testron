import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { en, ru } from '@testron/i18n';
import { SlangProvider, useTranslation } from '@warpunit/slang-react';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

import { queryClient } from './lib/trpc';
import { router } from './router';
import './styles/app.css';

const root = document.getElementById('root');
if (!root) throw new Error('The webapp root element is missing.');

const storedLocale = window.localStorage.getItem('testron.locale');
const initialLocale = storedLocale === 'ru' ? 'ru' : 'en';

const LocaleBridge = () => {
  const { locale } = useTranslation();

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem('testron.locale', locale);
    if (locale === 'en' || locale === 'ru') window.testronDesktop?.setLocale(locale);
  }, [locale]);

  return null;
};

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SlangProvider
        locale={initialLocale}
        fallbackLocale="en"
        resources={{ en, ru }}
        apiUrl="/slang/"
        checkForUpdate={false}
      >
        <LocaleBridge />
        <RouterProvider router={router} />
      </SlangProvider>
    </QueryClientProvider>
  </StrictMode>,
);
