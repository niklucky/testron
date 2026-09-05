import {
  parsePlaywright,
  renamePlaywrightTestSource,
  rewritePlaywrightSteps,
} from '@testron/domain/codegen/parse-playwright';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { redactStepSecrets, stepSchema, type Step } from '@testron/domain/steps/schema';
import {
  testSnapshotSchema,
  type RevisionStep,
  type ProjectInvitation,
  type ProjectMember,
  type TestSnapshot,
  type TestSuiteSummary,
  type TestRun,
  type ProjectOverviewSummary,
  type ProjectActivity,
  type BrowserAuthenticationFlow,
  type ProfileEnvironmentAuthentication,
  type ProjectSecretMetadata,
  type AuthenticationStateMetadata,
} from '@testron/protocol';
import { desktopTestDraftSchema, type DesktopTestDraft } from '../sync/client-state';

export interface ProjectRecord {
  id: string;
  ownerId?: string;
  name: string;
  url?: string | null;
  revision?: number;
}

export interface EnvironmentRecord {
  id: string;
  projectId: string;
  name: string;
  baseUrl: string;
  testIdAttribute: string;
  authRevision: number;
  revision?: number;
}

export interface ProfileRecord {
  id: string;
  projectId: string;
  environmentIds: string[];
  name: string;
  authenticationType: 'credentials' | 'cookies' | 'headers' | 'storage-state' | 'browser-session';
  revision?: number;
}

export interface ProfileVariableRecord {
  profileId: string;
  environmentId: string;
  name: string;
  value: string;
  sensitive: boolean;
}

export interface TestRecord {
  id: string;
  projectId: string;
  environmentIds: string[];
  testSuiteId?: string | null;
  profileId?: string | null;
  title: string;
  prerequisites: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LibrarySnapshot {
  viewer?: { id: string; email: string; name: string | null };
  members?: ProjectMember[];
  invitations?: ProjectInvitation[];
  pendingInvitations?: ProjectInvitation[];
  inviteeLookup?: { email: string; name: string | null };
  accountAction?: {
    type: 'profile' | 'password';
    status: 'pending' | 'success' | 'error';
    message?: string;
  };
  projects: ProjectRecord[];
  environments: EnvironmentRecord[];
  profiles: ProfileRecord[];
  authenticationFlows?: BrowserAuthenticationFlow[];
  profileEnvironmentAuthentications?: ProfileEnvironmentAuthentication[];
  projectSecrets?: ProjectSecretMetadata[];
  authenticationStates?: AuthenticationStateMetadata[];
  authenticationFlowSecretNames?: Record<string, string[]>;
  profileVariables: Array<Omit<ProfileVariableRecord, 'value'>>;
  tests: TestRecord[];
  testSuites: TestSuiteSummary[];
  deletedTests?: TestRecord[];
  deletedTestSuites?: TestSuiteSummary[];
  latestTestRuns?: Record<
    string,
    {
      status: 'passed' | 'failed' | 'cancelled' | 'timedOut';
      durationMs: number;
      startedAt: string;
    }
  >;
  recentRuns?: TestRun[];
  projectOverviews?: ProjectOverviewSummary[];
  recentActivity?: ProjectActivity[];
  selectedProjectId?: string;
  selectedEnvironmentId?: string;
  selectedTestSuiteId?: string;
  selectedProfileId?: string;
  selectedTestId?: string;
  sync?: { pending: number; conflicts: number };
  runsInFlight?: number;
  server?: {
    configured: boolean;
    authentication: 'signedOut' | 'authenticating' | 'signedIn';
    workspace: 'loading' | 'loaded' | 'unavailable';
    status: 'idle' | 'syncing' | 'synced' | 'offline' | 'conflicted' | 'error';
    message?: string;
  };
}

const migrations = [
  `
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE environments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      test_id_attribute TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE tests (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      environment_id TEXT NOT NULL REFERENCES environments(id),
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE test_steps (
      test_id TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (test_id, position)
    );
  `,
  `ALTER TABLE environments ADD COLUMN auth_revision INTEGER NOT NULL DEFAULT 1;`,
  `
    CREATE TABLE profiles (
      id TEXT PRIMARY KEY,
      environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      authentication_type TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE profile_variables (
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      value TEXT NOT NULL,
      sensitive INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (profile_id, name)
    );
  `,
  `
    CREATE TABLE server_resource_mappings (
      resource_kind TEXT NOT NULL CHECK (resource_kind IN ('project', 'environment', 'test')),
      local_id TEXT NOT NULL,
      server_id TEXT NOT NULL,
      PRIMARY KEY (resource_kind, local_id),
      UNIQUE (resource_kind, server_id)
    );
    CREATE TABLE test_drafts (
      local_test_id TEXT PRIMARY KEY REFERENCES tests(id) ON DELETE CASCADE,
      payload TEXT NOT NULL
    );
  `,
  `
    DROP TABLE IF EXISTS sync_conflicts;
    DROP TABLE IF EXISTS sync_outbox;
    DROP TABLE IF EXISTS acknowledged_tests;
  `,
  `ALTER TABLE tests ADD COLUMN test_suite_id TEXT;`,
  `
    ALTER TABLE tests ADD COLUMN environment_ids TEXT;
    UPDATE tests SET environment_ids = json_array(environment_id);
    UPDATE test_drafts
      SET payload = json_remove(
        json_set(payload, '$.content.environmentIds', json_array(json_extract(payload, '$.content.environmentId'))),
        '$.content.environmentId'
      );
    -- Pre-release reset: local profiles are disposable test data under the new project-scoped model.
    DROP TABLE profile_variables;
    DROP TABLE profiles;
    CREATE TABLE profiles (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      authentication_type TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE profile_variables (
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      value TEXT NOT NULL,
      sensitive INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (profile_id, environment_id, name)
    );
  `,
];

interface Row {
  [key: string]: unknown;
}

export class TestronRepository {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    mkdirSync(path.dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    this.migrate();
    this.backfillDrafts();
  }

  close(): void {
    this.database.close();
  }

  /** Remove the retired offline test cache after its pending drafts reach the server. */
  clearLegacyTests(): void {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database
        .prepare("DELETE FROM server_resource_mappings WHERE resource_kind = 'test'")
        .run();
      this.database.prepare('DELETE FROM tests').run();
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  listProjects(): ProjectRecord[] {
    return this.database
      .prepare('SELECT id, name FROM projects ORDER BY created_at, name')
      .all()
      .map((row) => ({ id: String(row.id), name: String(row.name) }));
  }

  listEnvironments(): EnvironmentRecord[] {
    return this.database
      .prepare(
        'SELECT id, project_id, name, base_url, test_id_attribute, auth_revision FROM environments ORDER BY created_at, name',
      )
      .all()
      .map((row) => ({
        id: String(row.id),
        projectId: String(row.project_id),
        name: String(row.name),
        baseUrl: String(row.base_url),
        testIdAttribute: String(row.test_id_attribute),
        authRevision: Number(row.auth_revision),
      }));
  }

  listProfiles(): ProfileRecord[] {
    return this.database
      .prepare(
        `SELECT profiles.id, profiles.project_id, profiles.name, profiles.authentication_type,
          group_concat(DISTINCT profile_variables.environment_id) AS environment_ids
         FROM profiles
         LEFT JOIN profile_variables ON profile_variables.profile_id = profiles.id
         GROUP BY profiles.id
         ORDER BY profiles.created_at, profiles.name`,
      )
      .all()
      .map((row) => ({
        id: String(row.id),
        projectId: String(row.project_id),
        environmentIds: row.environment_ids ? String(row.environment_ids).split(',') : [],
        name: String(row.name),
        authenticationType: String(row.authentication_type) as
          'credentials' | 'cookies' | 'headers' | 'storage-state' | 'browser-session',
      }));
  }

  listProfileVariables(): ProfileVariableRecord[] {
    return this.database
      .prepare(
        'SELECT profile_id, environment_id, name, value, sensitive FROM profile_variables ORDER BY name',
      )
      .all()
      .map((row) => ({
        profileId: String(row.profile_id),
        environmentId: String(row.environment_id),
        name: String(row.name),
        value: String(row.value),
        sensitive: Boolean(row.sensitive),
      }));
  }

  listTests(): TestRecord[] {
    return this.database
      .prepare(
        'SELECT id, project_id, environment_ids, test_suite_id, title, created_at, updated_at FROM tests ORDER BY updated_at DESC',
      )
      .all()
      .map((row) => {
        const draft = this.getDraft(String(row.id));
        return {
          id: String(row.id),
          projectId: String(row.project_id),
          environmentIds: JSON.parse(String(row.environment_ids)) as string[],
          testSuiteId: row.test_suite_id == null ? null : String(row.test_suite_id),
          profileId: draft?.content.profileId ?? null,
          title: String(row.title),
          prerequisites: draft?.content.prerequisites ?? [],
          createdAt: String(row.created_at),
          updatedAt: String(row.updated_at),
        };
      });
  }

  getProject(id: string): ProjectRecord | undefined {
    return this.listProjects().find((project) => project.id === id);
  }

  getEnvironment(id: string): EnvironmentRecord | undefined {
    return this.listEnvironments().find((environment) => environment.id === id);
  }

  getTest(id: string): TestRecord | undefined {
    return this.listTests().find((test) => test.id === id);
  }

  createProject(name: string): ProjectRecord {
    const project = { id: randomUUID(), name: name.trim() };
    this.database
      .prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)')
      .run(project.id, project.name, new Date().toISOString());
    return project;
  }

  createEnvironment(
    projectId: string,
    name: string,
    baseUrl: string,
    testIdAttribute: string,
  ): EnvironmentRecord {
    const environment = {
      id: randomUUID(),
      projectId,
      name: name.trim(),
      baseUrl,
      testIdAttribute: testIdAttribute.trim(),
      authRevision: 1,
    };
    this.database
      .prepare(
        `INSERT INTO environments
          (id, project_id, name, base_url, test_id_attribute, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        environment.id,
        projectId,
        environment.name,
        environment.baseUrl,
        environment.testIdAttribute,
        new Date().toISOString(),
      );
    return environment;
  }

  createProfile(
    environmentId: string,
    name: string,
    authenticationType: 'credentials' | 'cookies' | 'headers' | 'storage-state' | 'browser-session',
    variables: ReadonlyArray<{ name: string; value: string; sensitive: boolean }>,
  ): ProfileRecord {
    const environment = this.getEnvironment(environmentId);
    if (!environment) throw new Error('Environment not found.');
    const profile: ProfileRecord = {
      id: randomUUID(),
      projectId: environment.projectId,
      environmentIds: [environmentId],
      name: name.trim(),
      authenticationType,
    };
    const insertVariable = this.database.prepare(
      'INSERT INTO profile_variables (profile_id, environment_id, name, value, sensitive) VALUES (?, ?, ?, ?, ?)',
    );
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database
        .prepare(
          `INSERT INTO profiles (id, project_id, name, authentication_type, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          profile.id,
          profile.projectId,
          profile.name,
          profile.authenticationType,
          new Date().toISOString(),
        );
      for (const variable of variables)
        insertVariable.run(
          profile.id,
          environmentId,
          variable.name.trim(),
          variable.value,
          variable.sensitive ? 1 : 0,
        );
      this.database.exec('COMMIT');
      return profile;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  rotateAuthenticationRevision(environmentId: string): number {
    this.database
      .prepare('UPDATE environments SET auth_revision = auth_revision + 1 WHERE id = ?')
      .run(environmentId);
    const row = this.database
      .prepare('SELECT auth_revision FROM environments WHERE id = ?')
      .get(environmentId);
    if (!row) throw new Error('Environment not found.');
    return Number(row.auth_revision);
  }

  createTest(
    projectId: string,
    environmentIds: string[],
    title: string,
    testSuiteId?: string,
  ): TestRecord {
    const now = new Date().toISOString();
    const test = {
      id: randomUUID(),
      projectId,
      environmentIds,
      testSuiteId: testSuiteId ?? null,
      profileId: null,
      title: title.trim(),
      prerequisites: [],
      createdAt: now,
      updatedAt: now,
    };
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database
        .prepare(
          `INSERT INTO tests
            (id, project_id, environment_id, environment_ids, test_suite_id, title, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          test.id,
          projectId,
          environmentIds[0],
          JSON.stringify(environmentIds),
          test.testSuiteId,
          test.title,
          now,
          now,
        );
      this.writeDraft(
        test.id,
        desktopTestDraftSchema.parse({
          draftId: randomUUID(),
          projectId,
          testSuiteId: test.testSuiteId,
          baseRevision: null,
          content: { stepSchemaVersion: 1, title: test.title, environmentIds, steps: [] },
          localCreatedAt: now,
          localUpdatedAt: now,
          syncStatus: 'local',
        }),
      );
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
    return test;
  }

  renameTest(testId: string, title: string): void {
    const now = new Date().toISOString();
    this.database
      .prepare('UPDATE tests SET title = ?, updated_at = ? WHERE id = ?')
      .run(title.trim(), now, testId);
    const draft = this.getDraft(testId);
    if (draft)
      this.writeDraft(testId, {
        ...draft,
        content: {
          ...draft.content,
          title: title.trim(),
          ...(draft.content.source === undefined
            ? {}
            : { source: renamePlaywrightTestSource(draft.content.source, title.trim()) }),
        },
        localUpdatedAt: now,
        syncStatus: draft.testId ? 'pending' : 'local',
      });
  }

  setTestProfile(testId: string, profileId: string | null): void {
    const draft = this.getDraft(testId);
    if (!draft) throw new Error('The test draft was not found.');
    const now = new Date().toISOString();
    this.database.prepare('UPDATE tests SET updated_at = ? WHERE id = ?').run(now, testId);
    this.writeDraft(testId, {
      ...draft,
      content: { ...draft.content, profileId },
      localUpdatedAt: now,
      syncStatus: draft.testId ? 'pending' : 'local',
    });
  }

  replacePrerequisites(testId: string, prerequisites: readonly string[]): void {
    const draft = this.getDraft(testId);
    if (!draft) throw new Error('The test draft was not found.');
    const now = new Date().toISOString();
    this.database.prepare('UPDATE tests SET updated_at = ? WHERE id = ?').run(now, testId);
    this.writeDraft(testId, {
      ...draft,
      content: { ...draft.content, prerequisites: [...prerequisites] },
      localUpdatedAt: now,
      syncStatus: draft.testId ? 'pending' : 'local',
    });
  }

  loadSteps(testId: string): Step[] {
    return this.database
      .prepare('SELECT payload FROM test_steps WHERE test_id = ? ORDER BY position')
      .all(testId)
      .map((row) => redactStepSecrets(stepSchema.parse(JSON.parse(String(row.payload)))));
  }

  replaceSteps(testId: string, steps: readonly Step[]): void {
    const validated = steps.map((step) => redactStepSecrets(stepSchema.parse(step)));
    const previous = this.getDraft(testId);
    if (previous?.content.source !== undefined) {
      if (parsePlaywright(previous.content.source).error)
        throw new Error('Fix the source before editing manual steps.');
      this.replaceSource(
        testId,
        rewritePlaywrightSteps(previous.content.source, validated),
        validated,
      );
      return;
    }
    const now = new Date().toISOString();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare('DELETE FROM test_steps WHERE test_id = ?').run(testId);
      const insert = this.database.prepare(
        'INSERT INTO test_steps (test_id, position, payload) VALUES (?, ?, ?)',
      );
      validated.forEach((step, position) => insert.run(testId, position, JSON.stringify(step)));
      this.database.prepare('UPDATE tests SET updated_at = ? WHERE id = ?').run(now, testId);
      if (previous)
        this.writeDraft(testId, {
          ...previous,
          content: {
            ...previous.content,
            steps: this.reconcileRevisionSteps(previous.content.steps, validated),
          },
          localUpdatedAt: now,
          syncStatus: previous.testId ? 'pending' : 'local',
        });
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  replaceSource(testId: string, source: string, steps: readonly Step[], title?: string): void {
    const previous = this.getDraft(testId);
    if (!previous) throw new Error('The test draft was not found.');
    const validated = steps.map((step) => redactStepSecrets(stepSchema.parse(step)));
    const now = new Date().toISOString();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare('DELETE FROM test_steps WHERE test_id = ?').run(testId);
      const insert = this.database.prepare(
        'INSERT INTO test_steps (test_id, position, payload) VALUES (?, ?, ?)',
      );
      validated.forEach((step, position) => insert.run(testId, position, JSON.stringify(step)));
      this.database
        .prepare('UPDATE tests SET title = COALESCE(?, title), updated_at = ? WHERE id = ?')
        .run(title?.trim() || null, now, testId);
      this.writeDraft(testId, {
        ...previous,
        content: {
          ...previous.content,
          ...(title?.trim() ? { title: title.trim() } : {}),
          source,
          steps: this.reconcileRevisionSteps(previous.content.steps, validated),
        },
        localUpdatedAt: now,
        syncStatus: previous.testId ? 'pending' : 'local',
      });
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  getServerId(kind: 'project' | 'environment' | 'test', localId: string): string | undefined {
    const row = this.database
      .prepare(
        'SELECT server_id FROM server_resource_mappings WHERE resource_kind = ? AND local_id = ?',
      )
      .get(kind, localId);
    return row ? String(row.server_id) : undefined;
  }

  setServerId(kind: 'project' | 'environment' | 'test', localId: string, serverId: string): void {
    this.database
      .prepare(
        `INSERT INTO server_resource_mappings (resource_kind, local_id, server_id) VALUES (?, ?, ?)
         ON CONFLICT(resource_kind, local_id) DO UPDATE SET server_id = excluded.server_id`,
      )
      .run(kind, localId, serverId);
  }

  getDraft(localTestId: string): DesktopTestDraft | undefined {
    const row = this.database
      .prepare('SELECT payload FROM test_drafts WHERE local_test_id = ?')
      .get(localTestId);
    return row ? desktopTestDraftSchema.parse(JSON.parse(String(row.payload))) : undefined;
  }

  listDraftsNeedingSync(): Array<{ localTestId: string; draft: DesktopTestDraft }> {
    return this.database
      .prepare('SELECT local_test_id, payload FROM test_drafts ORDER BY rowid')
      .all()
      .map((row) => ({
        localTestId: String(row.local_test_id),
        draft: desktopTestDraftSchema.parse(JSON.parse(String(row.payload))),
      }))
      .filter(({ draft }) => draft.syncStatus === 'local' || draft.syncStatus === 'pending');
  }

  acknowledgeTest(localTestId: string, value: TestSnapshot): void {
    const snapshot = testSnapshotSchema.parse(value);
    const current = this.getDraft(localTestId);
    if (!current) throw new Error('The local test draft was not found.');
    this.setServerId('test', localTestId, snapshot.test.id);
    this.writeDraft(localTestId, {
      ...current,
      testId: snapshot.test.id,
      baseRevision: snapshot.test.currentRevision,
      content: {
        ...snapshot.currentRevision.content,
        environmentIds: current.content.environmentIds,
      },
      localUpdatedAt: new Date().toISOString(),
      syncStatus: 'synced',
    });
  }

  recordConflict(localTestId: string): void {
    const draft = this.getDraft(localTestId);
    if (draft) this.writeDraft(localTestId, { ...draft, syncStatus: 'conflicted' });
  }

  getSyncSummary(): { pending: number; conflicts: number } {
    const rows = this.database.prepare('SELECT payload FROM test_drafts').all();
    const statuses = rows.map(
      (row) => desktopTestDraftSchema.parse(JSON.parse(String(row.payload))).syncStatus,
    );
    return {
      pending: statuses.filter((status) => status === 'local' || status === 'pending').length,
      conflicts: statuses.filter((status) => status === 'conflicted').length,
    };
  }

  checkoutRemoteProject(project: ProjectRecord): ProjectRecord {
    this.database
      .prepare('INSERT OR IGNORE INTO projects (id, name, created_at) VALUES (?, ?, ?)')
      .run(project.id, project.name, new Date().toISOString());
    this.setServerId('project', project.id, project.id);
    return project;
  }

  checkoutRemoteEnvironment(environment: EnvironmentRecord): EnvironmentRecord {
    this.database
      .prepare(
        `INSERT OR IGNORE INTO environments
          (id, project_id, name, base_url, test_id_attribute, created_at, auth_revision)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        environment.id,
        environment.projectId,
        environment.name,
        environment.baseUrl,
        environment.testIdAttribute,
        new Date().toISOString(),
        environment.authRevision,
      );
    this.setServerId('environment', environment.id, environment.id);
    return environment;
  }

  checkoutRemoteTest(
    project: ProjectRecord,
    environments: EnvironmentRecord[],
    snapshotValue: TestSnapshot,
  ): TestRecord {
    const snapshot = testSnapshotSchema.parse(snapshotValue);
    const revision = snapshot.currentRevision;
    const assignedEnvironments = revision.content.environmentIds.map((environmentId) => {
      const environment = environments.find((candidate) => candidate.id === environmentId);
      if (!environment || environment.projectId !== project.id)
        throw new Error(`Environment ${environmentId} is not available locally.`);
      return environment;
    });
    const environmentIds = assignedEnvironments.map(({ id }) => id);
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database
        .prepare('INSERT OR IGNORE INTO projects (id, name, created_at) VALUES (?, ?, ?)')
        .run(project.id, project.name, snapshot.test.createdAt);
      const insertEnvironment = this.database.prepare(
        `INSERT OR IGNORE INTO environments
            (id, project_id, name, base_url, test_id_attribute, created_at, auth_revision)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const environment of assignedEnvironments)
        insertEnvironment.run(
          environment.id,
          project.id,
          environment.name,
          environment.baseUrl,
          environment.testIdAttribute,
          snapshot.test.createdAt,
          environment.authRevision,
        );
      this.database
        .prepare(
          `INSERT OR REPLACE INTO tests
            (id, project_id, environment_id, environment_ids, test_suite_id, title, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          snapshot.test.id,
          project.id,
          environmentIds[0],
          JSON.stringify(environmentIds),
          snapshot.test.testSuiteId,
          revision.content.title,
          snapshot.test.createdAt,
          revision.createdAt,
        );
      this.database.prepare('DELETE FROM test_steps WHERE test_id = ?').run(snapshot.test.id);
      const insert = this.database.prepare(
        'INSERT INTO test_steps (test_id, position, payload) VALUES (?, ?, ?)',
      );
      revision.content.steps.forEach((entry, index) =>
        insert.run(snapshot.test.id, index, JSON.stringify(entry.payload)),
      );
      this.setServerId('project', project.id, snapshot.test.projectId);
      assignedEnvironments.forEach((environment, index) =>
        this.setServerId('environment', environment.id, revision.content.environmentIds[index]!),
      );
      this.setServerId('test', snapshot.test.id, snapshot.test.id);
      const now = new Date().toISOString();
      this.writeDraft(snapshot.test.id, {
        draftId: randomUUID(),
        projectId: project.id,
        testId: snapshot.test.id,
        baseRevision: snapshot.test.currentRevision,
        content: { ...revision.content, environmentIds },
        localCreatedAt: now,
        localUpdatedAt: now,
        syncStatus: 'synced',
      });
      this.database.exec('COMMIT');
      return {
        id: snapshot.test.id,
        projectId: project.id,
        environmentIds,
        profileId: revision.content.profileId ?? null,
        title: revision.content.title,
        prerequisites: revision.content.prerequisites,
        createdAt: snapshot.test.createdAt,
        updatedAt: revision.createdAt,
      };
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  private writeDraft(localTestId: string, value: DesktopTestDraft): void {
    const draft = desktopTestDraftSchema.parse(value);
    this.database
      .prepare(
        `INSERT INTO test_drafts (local_test_id, payload) VALUES (?, ?)
         ON CONFLICT(local_test_id) DO UPDATE SET payload = excluded.payload`,
      )
      .run(localTestId, JSON.stringify(draft));
  }

  private reconcileRevisionSteps(
    previous: readonly RevisionStep[],
    steps: readonly Step[],
  ): RevisionStep[] {
    const remaining = new Set(previous.map((_, index) => index));
    return steps.map((payload, index) => {
      const serialized = JSON.stringify(payload);
      const exact = previous.findIndex(
        (entry, candidate) =>
          remaining.has(candidate) && JSON.stringify(entry.payload) === serialized,
      );
      const chosen =
        exact >= 0 ? exact : remaining.has(index) ? index : (remaining.values().next().value ?? -1);
      if (chosen >= 0) {
        remaining.delete(chosen);
        return { id: previous[chosen]!.id, payload };
      }
      return { id: randomUUID(), payload };
    });
  }

  private backfillDrafts(): void {
    for (const test of this.listTests()) {
      if (this.getDraft(test.id)) continue;
      this.writeDraft(test.id, {
        draftId: randomUUID(),
        projectId: test.projectId,
        testSuiteId: test.testSuiteId,
        baseRevision: null,
        content: {
          stepSchemaVersion: 1,
          title: test.title,
          environmentIds: test.environmentIds,
          prerequisites: test.prerequisites,
          steps: this.loadSteps(test.id).map((payload) => ({ id: randomUUID(), payload })),
        },
        localCreatedAt: test.createdAt,
        localUpdatedAt: test.updatedAt,
        syncStatus: 'local',
      });
    }
  }

  private migrate(): void {
    this.database.exec(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );`,
    );
    const current = Number(
      (this.database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as Row)
        .version ?? 0,
    );
    migrations.slice(current).forEach((migration, offset) => {
      const version = current + offset + 1;
      this.database.exec('BEGIN IMMEDIATE');
      try {
        this.database.exec(migration);
        this.database
          .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
          .run(version, new Date().toISOString());
        this.database.exec('COMMIT');
      } catch (error) {
        this.database.exec('ROLLBACK');
        throw error;
      }
    });
  }
}
