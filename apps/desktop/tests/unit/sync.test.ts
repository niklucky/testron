import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import type { TestSnapshot, WorkspaceSnapshot } from '@testron/protocol';
import { TestronRepository } from '../../src/main/persistence/repository';
import { DesktopSyncCoordinator } from '../../src/main/sync/coordinator';
import type { DesktopServerClient } from '../../src/main/sync/server-client';

const directories: string[] = [];
const repositories: TestronRepository[] = [];

afterEach(() => {
  repositories.splice(0).forEach((repository) => repository.close());
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

const repository = (): TestronRepository => {
  const directory = mkdtempSync(path.join(tmpdir(), 'testron-drafts-'));
  directories.push(directory);
  const value = new TestronRepository(path.join(directory, 'desktop.sqlite'));
  repositories.push(value);
  return value;
};

const step = (url = 'https://example.test/') => ({
  version: 1 as const,
  kind: 'navigate' as const,
  url,
  metadata: { recordedAt: '2026-01-01T00:00:00.000Z' },
});

const fakeServer = () => {
  const workspace: WorkspaceSnapshot = {
    viewer: {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'owner@example.test',
      name: null,
    },
    members: [],
    invitations: [],
    pendingInvitations: [],
    projects: [],
    environments: [],
    profiles: [],
    testSuites: [],
    tests: [],
    projectOverviews: [],
    recentActivity: [],
    activeRuns: [],
  };
  const client: Pick<
    DesktopServerClient,
    'createProject' | 'createEnvironment' | 'createTest' | 'getWorkspace' | 'saveTestRevision'
  > = {
    createProject: async (request) => {
      const now = new Date().toISOString();
      const project = {
        id: randomUUID(),
        ownerId: randomUUID(),
        name: request.name,
        url: null,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        deletion: { status: 'active' as const },
      };
      workspace.projects.push(project);
      return project;
    },
    createEnvironment: async (request) => {
      const now = new Date().toISOString();
      const environment = {
        id: randomUUID(),
        projectId: request.projectId,
        name: request.name,
        baseUrl: request.baseUrl,
        testIdAttribute: request.testIdAttribute,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        deletion: { status: 'active' as const },
      };
      workspace.environments.push(environment);
      return environment;
    },
    createTest: async (request) => {
      const now = new Date().toISOString();
      const testId = randomUUID();
      const revisionId = randomUUID();
      const snapshot: TestSnapshot = {
        test: {
          id: testId,
          projectId: request.projectId,
          testSuiteId: request.testSuiteId ?? null,
          title: request.content.title,
          currentRevision: { id: revisionId, number: 1 },
          createdAt: now,
          createdBy: randomUUID(),
          deletion: { status: 'active' },
        },
        currentRevision: {
          id: revisionId,
          testId,
          projectId: request.projectId,
          number: 1,
          parentRevision: null,
          content: request.content,
          createdAt: now,
          createdBy: randomUUID(),
        },
      };
      workspace.tests.push(snapshot);
      return snapshot;
    },
    getWorkspace: async () => structuredClone(workspace),
    saveTestRevision: async (request) => {
      const current = workspace.tests.find((snapshot) => snapshot.test.id === request.testId)!;
      const nextId = randomUUID();
      const number = current.currentRevision.number + 1;
      const snapshot: TestSnapshot = {
        test: {
          ...current.test,
          title: request.content.title,
          currentRevision: { id: nextId, number },
        },
        currentRevision: {
          ...current.currentRevision,
          id: nextId,
          number,
          parentRevision: current.test.currentRevision,
          content: request.content,
          createdAt: new Date().toISOString(),
        },
      };
      workspace.tests[workspace.tests.indexOf(current)] = snapshot;
      return { status: 'saved' as const, snapshot };
    },
  };
  return { client, workspace };
};

describe('online-first desktop synchronization', () => {
  it('publishes a local draft and keeps canonical workspace data in memory only', async () => {
    const local = repository();
    const project = local.createProject('Checkout');
    const environment = local.createEnvironment(
      project.id,
      'Production',
      'https://example.test/',
      'data-testid',
    );
    const test = local.createTest(project.id, environment.id, 'checkout');
    local.replaceSteps(test.id, [step()]);
    const remote = fakeServer();
    const coordinator = new DesktopSyncCoordinator(local, remote.client, '0.0.1');

    expect(await coordinator.flush()).toEqual({ status: 'synced' });
    expect(local.getDraft(test.id)).toMatchObject({ syncStatus: 'synced' });
    expect(local.getSyncSummary()).toEqual({ pending: 0, conflicts: 0 });
    const hydrated = await coordinator.hydrate();
    expect(hydrated.workspace?.tests).toHaveLength(1);

    const fresh = repository();
    expect(fresh.listProjects()).toEqual([]);
    expect(fresh.listTests()).toEqual([]);
    expect(await new DesktopSyncCoordinator(fresh, remote.client, '0.0.1').hydrate()).toMatchObject(
      {
        status: 'synced',
        workspace: {
          projects: [{ name: 'Checkout' }],
          tests: [{ currentRevision: { content: { title: 'checkout' } } }],
        },
      },
    );
  });

  it('keeps a draft conflicted without storing the canonical conflict snapshot', async () => {
    const local = repository();
    const project = local.createProject('Checkout');
    const environment = local.createEnvironment(
      project.id,
      'Production',
      'https://example.test/',
      'data-testid',
    );
    const test = local.createTest(project.id, environment.id, 'checkout');
    local.replaceSteps(test.id, [step()]);
    const remote = fakeServer();
    const coordinator = new DesktopSyncCoordinator(local, remote.client, '0.0.1');
    await coordinator.flush();
    local.replaceSteps(test.id, [step('https://example.test/cart')]);
    remote.client.saveTestRevision = async (request) => ({
      status: 'conflict',
      testId: request.testId,
      submittedBaseRevision: request.baseRevision,
      current: remote.workspace.tests[0]!,
    });

    expect(await coordinator.flush()).toMatchObject({ status: 'conflicted' });
    expect(local.getDraft(test.id)).toMatchObject({ syncStatus: 'conflicted' });
    expect(local.getSyncSummary()).toEqual({ pending: 0, conflicts: 1 });
  });

  it('preserves stable step IDs while editing a draft', () => {
    const local = repository();
    const project = local.createProject('Checkout');
    const environment = local.createEnvironment(
      project.id,
      'Production',
      'https://example.test/',
      'data-testid',
    );
    const test = local.createTest(project.id, environment.id, 'checkout');
    local.replaceSteps(test.id, [
      step('https://example.test/one'),
      step('https://example.test/two'),
    ]);
    const before = local.getDraft(test.id)!.content.steps;
    local.replaceSteps(test.id, [
      step('https://example.test/two'),
      step('https://example.test/edited'),
    ]);
    const after = local.getDraft(test.id)!.content.steps;
    expect(after[0]!.id).toBe(before[1]!.id);
    expect(after[1]!.id).toBe(before[0]!.id);
  });

  it('retains only the draft when the server is unavailable', async () => {
    const local = repository();
    const project = local.createProject('Checkout');
    const environment = local.createEnvironment(
      project.id,
      'Production',
      'https://example.test/',
      'data-testid',
    );
    const test = local.createTest(project.id, environment.id, 'checkout');
    local.replaceSteps(test.id, [step()]);
    const remote = fakeServer();
    remote.client.createProject = async () => Promise.reject(new Error('network unavailable'));

    expect(await new DesktopSyncCoordinator(local, remote.client, '0.0.1').flush()).toMatchObject({
      status: 'offline',
    });
    expect(local.getDraft(test.id)?.content.steps).toHaveLength(1);
    expect(local.getSyncSummary().pending).toBe(1);
  });
});
