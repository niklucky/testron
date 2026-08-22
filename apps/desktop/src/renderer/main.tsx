import { SlangProvider, useTranslation } from '@warpunit/slang-react';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import en from './locales/en.json';
import ru from './locales/ru.json';
import './app.css';

const slangApiKey = import.meta.env.VITE_SLANG_API_KEY;
const requestedLocale = new URLSearchParams(window.location.search).get('locale');
const initialLocale = requestedLocale === 'ru' ? 'ru' : 'en';

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
      checkForUpdate={Boolean(slangApiKey)}
    >
      <DesktopLocaleBridge />
      <App />
    </SlangProvider>
  </StrictMode>,
);
