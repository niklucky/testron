import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { TestronRepository } from '../../src/main/persistence/repository';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('TestronRepository', () => {
  it('migrates, transactionally stores steps, and restores a saved library', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'testron-repository-'));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, 'testron.sqlite');
    const repository = new TestronRepository(databasePath);
    const project = repository.createProject('Checkout');
    const environment = repository.createEnvironment(
      project.id,
      'Local',
      'http://127.0.0.1:4174/',
      'data-qa',
    );
    const test = repository.createTest(project.id, [environment.id], 'submit an order');
    const source = `import { test } from '@playwright/test';\n\ntest('submit an order', async ({ page }) => {\n  await page.goto('http://127.0.0.1:4174/');\n});\n`;
    repository.replaceSource(test.id, source, [
      {
        version: 1,
        kind: 'navigate',
        url: environment.baseUrl,
        metadata: { recordedAt: '2026-01-01T00:00:00.000Z' },
      },
    ]);
    repository.replacePrerequisites(test.id, ['Signed in as an administrator', 'Feature enabled']);
    repository.close();

    const reopened = new TestronRepository(databasePath);
    expect(reopened.listProjects()).toEqual([project]);
    expect(reopened.listEnvironments()).toEqual([environment]);
    expect(reopened.listTests()[0]).toMatchObject({
      id: test.id,
      title: test.title,
      prerequisites: ['Signed in as an administrator', 'Feature enabled'],
    });
    expect(reopened.loadSteps(test.id)).toHaveLength(1);
    expect(reopened.getDraft(test.id)?.content.source).toBe(source);
    reopened.close();
  });

  it('revisions reusable authentication state within one environment', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'testron-auth-revision-'));
    temporaryDirectories.push(directory);
    const repository = new TestronRepository(path.join(directory, 'testron.sqlite'));
    const project = repository.createProject('Accounts');
    const environment = repository.createEnvironment(
      project.id,
      'Local',
      'http://127.0.0.1:4174/',
      'data-testid',
    );

    expect(environment.authRevision).toBe(1);
    expect(repository.rotateAuthenticationRevision(environment.id)).toBe(2);
    expect(repository.listEnvironments()[0].authRevision).toBe(2);
    repository.close();
  });

  it('stores credential profiles and their named variables per environment', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'testron-profiles-'));
    temporaryDirectories.push(directory);
    const repository = new TestronRepository(path.join(directory, 'testron.sqlite'));
    const project = repository.createProject('Analytics');
    const environment = repository.createEnvironment(
      project.id,
      'Development',
      'https://dev.example.test/',
      'data-testid',
    );
    const profile = repository.createProfile(environment.id, 'Administrator', 'credentials', [
      { name: 'username', value: 'Administrator', sensitive: false },
      { name: 'password', value: 'not-a-real-password', sensitive: true },
    ]);

    expect(repository.listProfiles()).toEqual([profile]);
    expect(repository.listProfileVariables()).toEqual([
      {
        profileId: profile.id,
        environmentId: environment.id,
        name: 'password',
        value: 'not-a-real-password',
        sensitive: true,
      },
      {
        profileId: profile.id,
        environmentId: environment.id,
        name: 'username',
        value: 'Administrator',
        sensitive: false,
      },
    ]);
    const cookieProfile = repository.createProfile(environment.id, 'Session', 'cookies', [
      { name: 'sid', value: 'not-a-real-cookie', sensitive: true },
    ]);
    expect(cookieProfile.authenticationType).toBe('cookies');
    const headerProfile = repository.createProfile(environment.id, 'API token', 'headers', [
      { name: 'Authorization', value: 'Bearer secret', sensitive: true },
    ]);
    expect(headerProfile.authenticationType).toBe('headers');
    expect(repository.listProfiles()).toContainEqual(
      expect.objectContaining({ id: headerProfile.id, authenticationType: 'headers' }),
    );
    expect(repository.listProfileVariables()).toContainEqual(
      expect.objectContaining({
        profileId: headerProfile.id,
        name: 'Authorization',
        value: 'Bearer secret',
        sensitive: true,
      }),
    );
    repository.close();
  });

  it('restores the authentication profile selected for a test', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'testron-test-profile-'));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, 'testron.sqlite');
    const repository = new TestronRepository(databasePath);
    const project = repository.createProject('API');
    const environment = repository.createEnvironment(
      project.id,
      'Local',
      'http://127.0.0.1:4174/',
      'data-testid',
    );
    const profile = repository.createProfile(environment.id, 'Admin JWT', 'headers', [
      { name: 'Authorization', value: 'Bearer token', sensitive: true },
    ]);
    const savedTest = repository.createTest(project.id, [environment.id], 'admin request');
    repository.setTestProfile(savedTest.id, profile.id);
    repository.close();

    const reopened = new TestronRepository(databasePath);
    expect(reopened.getTest(savedTest.id)?.profileId).toBe(profile.id);
    reopened.close();
  });

  it('preserves every environment when checking out a remote test', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'testron-checkout-'));
    temporaryDirectories.push(directory);
    const repository = new TestronRepository(path.join(directory, 'testron.sqlite'));
    const project = repository.createProject('Multi-environment');
    const development = repository.createEnvironment(
      project.id,
      'Development',
      'https://dev.example.test/',
      'data-testid',
    );
    const production = repository.createEnvironment(
      project.id,
      'Production',
      'https://example.test/',
      'data-testid',
    );
    const testId = randomUUID();
    const revisionId = randomUUID();
    const actorId = randomUUID();
    const createdAt = '2026-01-01T00:00:00.000Z';

    const test = repository.checkoutRemoteTest(project, [development, production], {
      test: {
        id: testId,
        projectId: project.id,
        testSuiteId: null,
        title: 'works everywhere',
        currentRevision: { id: revisionId, number: 1 },
        createdAt,
        createdBy: actorId,
        deletion: { status: 'active' },
      },
      currentRevision: {
        id: revisionId,
        testId,
        projectId: project.id,
        number: 1,
        parentRevision: null,
        content: {
          stepSchemaVersion: 1,
          title: 'works everywhere',
          environmentIds: [development.id, production.id],
          prerequisites: [],
          steps: [],
        },
        createdAt,
        createdBy: actorId,
      },
    });

    expect(test.environmentIds).toEqual([development.id, production.id]);
    expect(repository.getDraft(test.id)?.content.environmentIds).toEqual([
      development.id,
      production.id,
    ]);
    repository.close();
  });

  it('redacts a secret value before writing the step payload', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'testron-secrets-'));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, 'testron.sqlite');
    const repository = new TestronRepository(databasePath);
    const project = repository.createProject('Secrets');
    const environment = repository.createEnvironment(
      project.id,
      'Local',
      'http://127.0.0.1:4174/',
      'data-testid',
    );
    const test = repository.createTest(project.id, [environment.id], 'sign in');
    repository.replaceSteps(test.id, [
      {
        version: 1,
        kind: 'fill',
        target: {
          primary: { strategy: 'testId', attribute: 'data-testid', value: 'password' },
          alternatives: [],
        },
        value: 'must-never-be-written',
        secret: { environmentVariable: 'TESTRON_PASSWORD' },
        metadata: { recordedAt: '2026-01-01T00:00:00.000Z' },
      },
    ]);
    repository.close();

    const database = new DatabaseSync(databasePath, { readOnly: true });
    const row = database.prepare('SELECT payload FROM test_steps').get();
    expect(String(row?.payload)).not.toContain('must-never-be-written');
    expect(String(row?.payload)).toContain('TESTRON_PASSWORD');
    database.close();
  });

  it('redacts a resolved profile value before writing the step payload', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'testron-profile-step-'));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, 'testron.sqlite');
    const repository = new TestronRepository(databasePath);
    const project = repository.createProject('Profiles');
    const environment = repository.createEnvironment(
      project.id,
      'Development',
      'https://dev.example.test/',
      'data-testid',
    );
    const test = repository.createTest(project.id, [environment.id], 'sign in');
    repository.replaceSteps(test.id, [
      {
        version: 1,
        kind: 'fill',
        target: {
          primary: { strategy: 'name', value: 'username' },
          alternatives: [],
        },
        value: 'must-never-be-written',
        variable: { name: 'username' },
        metadata: { recordedAt: '2026-01-01T00:00:00.000Z' },
      },
    ]);
    repository.close();

    const database = new DatabaseSync(databasePath, { readOnly: true });
    const row = database.prepare('SELECT payload FROM test_steps').get();
    expect(String(row?.payload)).not.toContain('must-never-be-written');
    expect(String(row?.payload)).toContain('username');
    database.close();
  });

  it('backfills legacy authoring rows as drafts without a canonical cache or outbox', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'testron-backfill-'));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, 'testron.sqlite');
    const repository = new TestronRepository(databasePath);
    const project = repository.createProject('Legacy');
    const environment = repository.createEnvironment(
      project.id,
      'Local',
      'http://127.0.0.1:4174/',
      'data-testid',
    );
    const test = repository.createTest(project.id, [environment.id], 'legacy test');
    repository.replaceSteps(test.id, [
      {
        version: 1,
        kind: 'navigate',
        url: environment.baseUrl,
        metadata: { recordedAt: '2026-01-01T00:00:00.000Z' },
      },
    ]);
    repository.close();

    const database = new DatabaseSync(databasePath);
    database.exec(`
      DELETE FROM test_drafts;
      DELETE FROM server_resource_mappings;
    `);
    database.close();

    const migrated = new TestronRepository(databasePath);
    expect(migrated.getDraft(test.id)).toMatchObject({
      content: { title: 'legacy test', steps: [{ payload: { kind: 'navigate' } }] },
      syncStatus: 'local',
    });
    expect(migrated.getSyncSummary()).toEqual({ pending: 1, conflicts: 0 });
    migrated.close();

    const inspected = new DatabaseSync(databasePath, { readOnly: true });
    const tables = inspected
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => String(row.name));
    expect(tables).not.toContain('sync_outbox');
    expect(tables).not.toContain('acknowledged_tests');
    expect(tables).not.toContain('sync_conflicts');
    inspected.close();
  });
});
