import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/electron',
  workers: 1,
  reporter: 'line',
  timeout: 30_000,
  webServer: {
    command: 'npm run start --workspace @testron/test-fixtures',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: true,
  },
});
