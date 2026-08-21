import { defineConfig } from '@playwright/test';
import { chromium } from '@playwright/test';
import path from 'node:path';

// Recorder and persistence scenarios intentionally exercise the standalone
// local workflow. The authentication spec supplies a remote URL and therefore
// still enters the real signed-out landing state.
process.env.TESTRON_LOCAL_MODE = '1';
let browserRevisionDirectory = chromium.executablePath();
while (!/^(chromium|chromium_headless_shell)-\d+$/.test(path.basename(browserRevisionDirectory))) {
  const parent = path.dirname(browserRevisionDirectory);
  if (parent === browserRevisionDirectory) throw new Error('Could not locate Playwright browsers.');
  browserRevisionDirectory = parent;
}
process.env.TESTRON_BROWSERS_PATH ??= path.dirname(browserRevisionDirectory);

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
