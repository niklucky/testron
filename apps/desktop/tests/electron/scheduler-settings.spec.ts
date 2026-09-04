import { expect, test, type Page } from '@playwright/test';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';

// Exercise the real React form with fresh workspace objects, without a database
// or timers. The desktop suite already provides Chromium and browser fixtures.
let server: ViteDevServer;
let baseUrl: string;

test.beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: path.resolve('../webapp'),
    cacheDir: path.resolve('.vite/scheduler-test-cache'),
    plugins: [react(), tailwindcss()],
    appType: 'custom',
    server: { host: '127.0.0.1', port: 0 },
  });
  server.middlewares.use('/__scheduler', async (_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(
      await server.transformIndexHtml(
        '/__scheduler',
        `
      <div id="root"></div>
      <script type="module">
        import React from 'react';
        import '/src/styles/app.css';
        import { createRoot } from 'react-dom/client';
        import { RunSchedulerSettings } from '/src/components/features/projects/RunSchedulerSettings.tsx';
        const root = createRoot(document.getElementById('root'));
        window.commands = [];
        window.testron = { command: (command) => window.commands.push(command) };
        window.renderScheduler = (library) => root.render(
          React.createElement(RunSchedulerSettings, { library, projectId: 'project' })
        );
      </script>
    `,
      ),
    );
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === 'string') throw new Error('Form fixture did not start');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await server?.close();
});

const schedule = {
  id: 'schedule',
  projectId: 'project',
  name: 'Saved schedule',
  cron: '0 0 * * *',
  environmentId: 'local',
  testIds: ['login'],
  enabled: true,
  nextRunAt: null,
  revision: 1,
};

const workspace = (saved = false) => ({
  environments: [
    { id: 'local', projectId: 'project', name: 'Local' },
    { id: 'staging', projectId: 'project', name: 'Staging' },
  ],
  tests: [
    {
      id: 'login',
      projectId: 'project',
      title: 'Login test',
      environmentIds: ['local'],
      testSuiteId: 'suite-login' as string | null,
    },
    {
      id: 'checkout',
      projectId: 'project',
      title: 'Checkout test',
      environmentIds: ['staging'],
      testSuiteId: 'suite-checkout' as string | null,
    },
  ],
  testSuites: [
    { id: 'suite-login', projectId: 'project', name: 'Authentication' },
    { id: 'suite-checkout', projectId: 'project', name: 'Checkout' },
  ],
  runSchedules: saved ? [schedule, { ...schedule, id: 'other', name: 'Other schedule' }] : [],
  serverRunJobs: [
    {
      id: 'job',
      projectId: 'project',
      testId: 'login',
      status: 'running',
      queuedAt: '2026-09-04T00:00:00Z',
    },
  ],
});

const render = (page: Page, library: ReturnType<typeof workspace>) =>
  page.evaluate((value) => {
    (window as unknown as { renderScheduler: (value: unknown) => void }).renderScheduler(value);
  }, library);

for (const saved of [false, true]) {
  test(`workspace polling preserves ${saved ? 'existing' : 'new'} schedule edits`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${baseUrl}/__scheduler`);
    await page.waitForFunction(() => 'renderScheduler' in window);
    await render(page, workspace(saved));
    await expect
      .poll(async () => ({ forms: await page.locator('form').count(), errors }))
      .toEqual({ forms: 1, errors: [] });
    await page.getByRole('combobox', { name: /^Environment/ }).selectOption('staging');
    await page.getByRole('button', { name: 'Select tests', exact: true }).click();
    await page.getByRole('button', { name: 'Expand Checkout' }).click();
    await page.getByLabel('Checkout test').check();
    await page.getByRole('button', { name: 'Apply selection' }).click();
    await page.getByLabel('Enabled', { exact: true }).uncheck();
    await page.getByLabel('UTC cron', { exact: true }).fill('0 1 * * *');
    const name = page.getByLabel('Name', { exact: true });
    await name.fill('Unsaved draft');

    for (let refresh = 0; refresh < 3; refresh++) {
      const next = workspace(saved);
      next.serverRunJobs[0]!.status = 'completed';
      await render(page, next);
      await expect(page.getByText('completed', { exact: true })).toBeVisible();
      await expect(name).toHaveValue('Unsaved draft');
      await expect(name).toBeFocused();
      await expect(page.getByLabel('UTC cron', { exact: true })).toHaveValue('0 1 * * *');
      await expect(page.getByRole('combobox', { name: /^Environment/ })).toHaveValue('staging');
      await expect(page.getByText('1 of 1 tests selected')).toBeVisible();
      await expect(page.getByLabel('Enabled', { exact: true })).not.toBeChecked();
    }
    await page.getByRole('button', { name: saved ? 'Save schedule' : 'Create schedule' }).click();
    expect(
      await page.evaluate(() => (window as unknown as { commands: unknown[] }).commands),
    ).toEqual([
      expect.objectContaining({
        type: saved ? 'update-run-schedule' : 'create-run-schedule',
        name: 'Unsaved draft',
        cron: '0 1 * * *',
        environmentId: 'staging',
        testIds: ['checkout'],
        enabled: false,
      }),
    ]);

    if (saved) {
      const primaryActions = page.getByRole('button', { name: 'Save schedule' }).locator('..');
      await expect(primaryActions.getByRole('button', { name: 'Run now' })).toBeVisible();
      await expect(
        primaryActions.getByRole('button', { name: 'Run now' }).locator('svg'),
      ).toHaveCount(1);
      await expect(primaryActions.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(
        0,
      );
      await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveClass(
        /text-critical/,
      );
      await page.getByRole('button', { name: /Other schedule/ }).click();
      await expect(name).toHaveValue('Other schedule');
      await expect(page.getByText('1 of 1 tests selected')).toBeVisible();
      await page.getByRole('button', { name: 'Add schedule' }).click();
      await expect(name).toHaveValue('Scheduled test run');
      await expect(page.getByText('0 of 1 tests selected')).toBeVisible();
    }
  });
}

test('test picker supports suites, partial selection, all tests, and cancel across refreshes', async ({
  page,
}) => {
  const library = workspace();
  library.tests.push(
    {
      id: 'logout',
      projectId: 'project',
      title: 'Logout test',
      environmentIds: ['local'],
      testSuiteId: 'suite-login',
    },
    {
      id: 'smoke',
      projectId: 'project',
      title: 'Smoke test',
      environmentIds: ['local'],
      testSuiteId: null,
    },
  );
  await page.goto(`${baseUrl}/__scheduler`);
  await page.waitForFunction(() => 'renderScheduler' in window);
  await render(page, library);
  const open = page.getByRole('button', { name: 'Select tests', exact: true });
  await open.click();
  const modal = page.getByRole('dialog', { name: 'Select tests', exact: true });
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('checkbox', { name: 'Select suite Checkout' })).toHaveCount(0);
  await modal.getByRole('button', { name: 'Expand Authentication' }).click();
  await modal.getByRole('checkbox', { name: 'Login test', exact: true }).check();
  await expect(
    modal.getByRole('checkbox', { name: 'Select suite Authentication' }),
  ).toHaveAttribute('aria-checked', 'mixed');
  await expect(modal.getByRole('checkbox', { name: 'Select all', exact: true })).toHaveAttribute(
    'aria-checked',
    'mixed',
  );
  await render(page, structuredClone(library));
  await expect(modal.getByRole('checkbox', { name: 'Login test', exact: true })).toBeChecked();
  await modal.getByRole('button', { name: 'Collapse Authentication' }).click();
  await expect(modal.getByRole('checkbox', { name: 'Login test', exact: true })).toHaveCount(0);
  await modal.getByRole('checkbox', { name: 'Select suite Authentication' }).check();
  await modal.getByRole('button', { name: 'Expand Authentication' }).click();
  await expect(modal.getByRole('checkbox', { name: 'Logout test', exact: true })).toBeChecked();
  await modal.getByRole('checkbox', { name: 'Select all', exact: true }).check();
  await expect(modal.getByText('3 of 3 selected')).toBeVisible();
  await modal.getByRole('checkbox', { name: 'Deselect all', exact: true }).uncheck();
  await expect(modal.getByText('0 of 3 selected')).toBeVisible();
  await modal.getByRole('button', { name: 'Expand Unassigned' }).click();
  await modal.getByRole('checkbox', { name: 'Smoke test', exact: true }).check();
  await page.screenshot({ path: test.info().outputPath('test-picker.png') });
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('0 of 3 tests selected')).toBeVisible();
  await expect(open).toBeFocused();

  await open.click();
  await modal.getByRole('checkbox', { name: 'Select suite Authentication' }).check();
  await modal.getByRole('button', { name: 'Apply selection' }).click();
  await expect(page.getByText('2 of 3 tests selected')).toBeVisible();
  await open.click();
  await modal.getByRole('checkbox', { name: 'Select all', exact: true }).check();
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  await expect(page.getByText('2 of 3 tests selected')).toBeVisible();
  await expect(open).toBeFocused();
  await page.getByRole('button', { name: 'Create schedule' }).click();
  expect(
    await page.evaluate(() => (window as unknown as { commands: unknown[] }).commands),
  ).toEqual([expect.objectContaining({ testIds: ['login', 'logout'] })]);
  await page.getByRole('combobox', { name: /^Environment/ }).selectOption('staging');
  await expect(page.getByText('0 of 1 tests selected')).toBeVisible();
});

test('scheduler shows only the newest five project runs and red destructive buttons in both themes', async ({
  page,
}) => {
  const library = workspace(true);
  library.serverRunJobs = Array.from({ length: 8 }, (_, index) => ({
    id: `job-${index}`,
    projectId: 'project',
    testId: `test-${index}`,
    status: 'completed',
    queuedAt: `2026-09-04T00:0${index}:00Z`,
  }));
  library.serverRunJobs.push({
    id: 'foreign',
    projectId: 'other-project',
    testId: 'foreign',
    status: 'completed',
    queuedAt: '2026-09-04T00:09:00Z',
  });
  await page.goto(`${baseUrl}/__scheduler`);
  await page.waitForFunction(() => 'renderScheduler' in window);
  await render(page, library);
  const runs = page.getByRole('region', { name: 'Latest 5 runs' });
  await expect(runs.getByText('completed', { exact: true })).toHaveCount(5);
  await expect(runs.locator('span.truncate')).toHaveText([
    'test-7',
    'test-6',
    'test-5',
    'test-4',
    'test-3',
  ]);
  const button = page.getByRole('button', { name: 'Delete', exact: true });
  await expect(button).toHaveCSS('color', 'rgb(208, 59, 59)');
  await expect(button).toHaveCSS('background-color', 'rgba(208, 59, 59, 0.13)');
  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
  await expect(button).toHaveCSS('color', 'rgb(194, 52, 52)');
  await expect(button).toHaveCSS('background-color', 'rgba(194, 52, 52, 0.1)');
});
