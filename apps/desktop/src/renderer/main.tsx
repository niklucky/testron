import { SlangProvider } from '@warpunit/slang-react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import en from './locales/en.json';
import ru from './locales/ru.json';
import './app.css';

const slangApiKey = import.meta.env.VITE_SLANG_API_KEY;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SlangProvider
      locale="en"
      fallbackLocale="en"
      resources={{ en, ru }}
      apiUrl="/slang/"
      checkForUpdate={Boolean(slangApiKey)}
    >
      <App />
    </SlangProvider>
  </StrictMode>,
);
