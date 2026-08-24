import type { TestronApi } from './preload/api';

declare global {
  const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
  const MAIN_WINDOW_VITE_NAME: string;
  const __TESTRON_DEFAULT_SERVER_URL__: string;
  const __TESTRON_WEBAPP_URL__: string;
  const __TESTRON_UPDATE_MANIFEST_URL__: string;

  interface Window {
    testron: TestronApi;
  }
}
