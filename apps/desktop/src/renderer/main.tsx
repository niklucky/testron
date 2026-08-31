import { SlangProvider, useTranslation } from '@warpunit/slang-react';
import { en, isSupportedLocale, ru } from '@testron/i18n';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './app.css';

const requestedLocale = new URLSearchParams(window.location.search).get('locale');
const initialLocale = isSupportedLocale(requestedLocale) ? requestedLocale : 'en';

const DesktopLocaleBridge = () => {
  const { locale, setLocale } = useTranslation();

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => window.testron?.onLocale(setLocale), [setLocale]);

  return null;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SlangProvider
      locale={initialLocale}
      fallbackLocale="en"
      resources={{ en, ru }}
      apiUrl="/slang/"
      checkForUpdate={false}
    >
      <DesktopLocaleBridge />
      <App />
    </SlangProvider>
  </StrictMode>,
);
