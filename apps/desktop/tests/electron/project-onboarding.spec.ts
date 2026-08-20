import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createAppRouter } from '@testron/server/router';
import type { Project, WorkspaceSnapshot } from '@testron/protocol';
import { createHttpServer } from '../../../server/src/http';

const now = '2026-08-19T00:00:00.000Z';
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'owner@example.test',
  name: null,
};

test('an empty remote workspace onboards and the selector creates server projects', async () => {
  const projects: Project[] = [];
  let nextProject = 10;
  let workspaceOffline = false;
  const workspace = (): WorkspaceSnapshot => ({
    viewer: user,
    projects,
    environments: [],
    profiles: [],
    testSuites: [],
    tests: [],
    activeRuns: [],
  });
  const authentication = {
    register: async () => ({
      accessToken: 'a'.repeat(48),
      expiresAt: '2026-09-19T00:00:00.000Z',
    }),
    login: async () => ({
      accessToken: 'b'.repeat(48),
      expiresAt: '2026-09-19T00:00:00.000Z',
    }),
    authenticate: async () => user,
  };
  const repository = {
    getWorkspace: async () => {
      if (workspaceOffline) throw new Error('temporary workspace outage');
      return workspace();
    },
    createProject: async (_user: typeof user, request: { name: string }) => {
      const project: Project = {
        id: `00000000-0000-4000-8000-${String(nextProject++).padStart(12, '0')}`,
        ownerId: user.id,
        name: request.name,
        url: null,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        deletion: { status: 'active' },
      };
      projects.push(project);
      return project;
    },
  };
  const router = createAppRouter({
    authentication: authentication as never,
    repository: repository as never,
  });
  const server = createHttpServer({ router, authentication: authentication as never });
  await new Promise<void>((resolve) => server.listen(4400, '127.0.0.1', resolve));

  const dataDirectory = mkdtempSync(path.join(tmpdir(), 'testron-project-onboarding-'));
  const electronApp = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      TESTRON_DATA_DIR: dataDirectory,
    },
  });

  try {
    const appWindow = await electronApp.firstWindow();
    await appWindow.getByRole('button', { name: 'Create account' }).first().click();
    await appWindow.getByLabel('Email address').fill('owner@example.test');
    await appWindow.getByLabel('Password', { exact: true }).fill('correct horse battery staple');
    await appWindow.getByLabel('Confirm password').fill('correct horse battery staple');
    await appWindow.getByRole('button', { name: 'Create account' }).last().click();

    await expect(
      appWindow.getByRole('heading', { name: 'Create a project to get started' }),
    ).toBeVisible();
    await expect(appWindow.getByText('owner@example.test', { exact: true })).toBeVisible();
    await appWindow.getByLabel('Project name').fill('Commerce website');
    await appWindow.getByRole('button', { name: 'Create project' }).click();

    const selector = appWindow.getByRole('combobox', { name: 'Project' });
    await expect(selector).toHaveValue('00000000-0000-4000-8000-000000000010');
    await expect(selector.locator('option')).toHaveText(['Commerce website', '+ Create project']);
    await expect(appWindow.getByText('0 runs in flight')).toBeVisible();
    await expect(appWindow.getByRole('button', { name: 'Jump to…' })).toBeVisible();
    await expect(appWindow.getByRole('button', { name: 'Sync' })).toHaveCount(0);
    await expect(appWindow.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
    await expect(appWindow.getByRole('button', { name: 'Switch to dark' })).toHaveCount(0);
    await expect(appWindow.getByRole('button', { name: 'Row density' })).toHaveCount(0);
    await expect(
      appWindow.getByRole('button', { name: 'Focus mode — hide the context rail' }),
    ).toHaveCount(0);

    await selector.selectOption({ label: '+ Create project' });
    await expect(appWindow.getByRole('heading', { name: 'Create another project' })).toBeVisible();
    const dialog = appWindow.getByRole('dialog');
    const projectName = dialog.getByLabel('Project name');
    await projectName.fill('Docs website');

    // Background reconnect snapshots must not unmount, resize, or reset the
    // open modal. This reproduces the former periodic blinking behavior.
    workspaceOffline = true;
    await appWindow.evaluate(() => window.testron.command({ type: 'sync-now' }));
    await expect
      .poll(() =>
        appWindow.evaluate(
          () =>
            new Promise<string | undefined>((resolve) => {
              const unsubscribe = window.testron.onSnapshot((snapshot) => {
                unsubscribe();
                resolve(snapshot.library.server?.status);
              });
              window.testron.command({ type: 'request-snapshot' });
            }),
        ),
      )
      .toBe('offline');
    await appWindow.waitForTimeout(2_500);
    await expect(dialog).toBeVisible();
    await expect(projectName).toHaveValue('Docs website');
    await expect(dialog.getByRole('alert')).toHaveCount(0);

    workspaceOffline = false;
    await appWindow.evaluate(() => window.testron.command({ type: 'sync-now' }));
    await expect
      .poll(() =>
        appWindow.evaluate(
          () =>
            new Promise<string | undefined>((resolve) => {
              const unsubscribe = window.testron.onSnapshot((snapshot) => {
                unsubscribe();
                resolve(snapshot.library.server?.status);
              });
              window.testron.command({ type: 'request-snapshot' });
            }),
        ),
      )
      .toBe('synced');
    await dialog.getByRole('button', { name: 'Create project' }).click();

    await expect(selector.locator('option')).toHaveText([
      'Commerce website',
      'Docs website',
      '+ Create project',
    ]);
    await expect(selector).toHaveValue('00000000-0000-4000-8000-000000000011');
    expect(projects.map((project) => project.name)).toEqual(['Commerce website', 'Docs website']);
  } finally {
    await electronApp.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});
