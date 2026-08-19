import { defineConfig } from '@playwright/test';

// Recorder and persistence scenarios intentionally exercise the standalone
// local workflow. The authentication spec supplies a remote URL and therefore
// still enters the real signed-out landing state.
process.env.TESTRON_LOCAL_MODE = '1';

export default defineConfig({
  testDir: './tests/electron',
  workers: 1,
  reporter: 'line',
  timeout: 30_000,
  webServer: {
    command: 'pnpm --filter @testron/test-fixtures start',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: true,
  },
});
