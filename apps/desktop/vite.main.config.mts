import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    sourcemap: true,
    rollupOptions: {
      // Playwright contains browser drivers and dynamic Node modules. It must remain a
      // runtime dependency instead of being folded into Electron's watched main bundle.
      external: ['@playwright/test'],
    },
  },
});
