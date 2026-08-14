import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/generated',
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: { headless: true },
  webServer: {
    command: 'node scripts/fixture-server.mjs',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: true,
  },
});
