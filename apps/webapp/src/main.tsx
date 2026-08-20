import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { SlangProvider } from '@warpunit/slang-react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { queryClient } from './lib/trpc';
import en from './locales/en.json';
import ru from './locales/ru.json';
import { router } from './router';
import './styles/app.css';

const root = document.getElementById('root');
if (!root) throw new Error('The webapp root element is missing.');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SlangProvider
        locale="en"
        fallbackLocale="en"
        resources={{ en, ru }}
        apiUrl="/slang/"
        checkForUpdate={false}
      >
        <RouterProvider router={router} />
      </SlangProvider>
    </QueryClientProvider>
  </StrictMode>,
);
