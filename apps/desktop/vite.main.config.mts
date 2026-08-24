import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    __TESTRON_DEFAULT_SERVER_URL__: JSON.stringify(
      process.env.TESTRON_SERVER_URL ?? 'http://127.0.0.1:4400',
    ),
    __TESTRON_WEBAPP_URL__: JSON.stringify(
      process.env.TESTRON_WEBAPP_URL ?? 'https://app.testron.dev',
    ),
    __TESTRON_UPDATE_MANIFEST_URL__: JSON.stringify(
      process.env.TESTRON_UPDATE_MANIFEST_URL ??
        'https://github.com/niklucky/testron/releases/latest/download/update-manifest.json',
    ),
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      // Playwright contains browser drivers and dynamic Node modules. It must remain a
      // runtime dependency instead of being folded into Electron's watched main bundle.
      external: ['@playwright/test'],
    },
  },
});
