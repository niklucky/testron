import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { redactStepSecrets, stepSchema, type Step } from '@testron/domain/steps/schema';

export interface ProjectRecord {
  id: string;
  name: string;
}

export interface EnvironmentRecord {
  id: string;
  projectId: string;
  name: string;
  baseUrl: string;
  testIdAttribute: string;
  authRevision: number;
}

export interface ProfileRecord {
  id: string;
  environmentId: string;
  name: string;
  authenticationType: 'credentials';
}

export interface ProfileVariableRecord {
  profileId: string;
  name: string;
  value: string;
  sensitive: boolean;
}

export interface TestRecord {
  id: string;
  projectId: string;
  environmentId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface LibrarySnapshot {
  projects: ProjectRecord[];
  environments: EnvironmentRecord[];
  profiles: ProfileRecord[];
  profileVariables: Array<Omit<ProfileVariableRecord, 'value'>>;
  tests: TestRecord[];
  selectedProjectId?: string;
  selectedEnvironmentId?: string;
  selectedProfileId?: string;
  selectedTestId?: string;
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
  }

  close(): void {
    this.database.close();
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
        'SELECT id, environment_id, name, authentication_type FROM profiles ORDER BY created_at, name',
      )
      .all()
      .map((row) => ({
        id: String(row.id),
        environmentId: String(row.environment_id),
        name: String(row.name),
        authenticationType: 'credentials' as const,
      }));
  }

  listProfileVariables(): ProfileVariableRecord[] {
    return this.database
      .prepare('SELECT profile_id, name, value, sensitive FROM profile_variables ORDER BY name')
      .all()
      .map((row) => ({
        profileId: String(row.profile_id),
        name: String(row.name),
        value: String(row.value),
        sensitive: Boolean(row.sensitive),
      }));
  }

  listTests(): TestRecord[] {
    return this.database
      .prepare(
        'SELECT id, project_id, environment_id, title, created_at, updated_at FROM tests ORDER BY updated_at DESC',
      )
      .all()
      .map((row) => ({
        id: String(row.id),
        projectId: String(row.project_id),
        environmentId: String(row.environment_id),
        title: String(row.title),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      }));
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
    variables: ReadonlyArray<{ name: string; value: string; sensitive: boolean }>,
  ): ProfileRecord {
    const profile: ProfileRecord = {
      id: randomUUID(),
      environmentId,
      name: name.trim(),
      authenticationType: 'credentials',
    };
    const insertVariable = this.database.prepare(
      'INSERT INTO profile_variables (profile_id, name, value, sensitive) VALUES (?, ?, ?, ?)',
    );
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database
        .prepare(
          `INSERT INTO profiles (id, environment_id, name, authentication_type, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          profile.id,
          profile.environmentId,
          profile.name,
          profile.authenticationType,
          new Date().toISOString(),
        );
      for (const variable of variables)
        insertVariable.run(
          profile.id,
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

  createTest(projectId: string, environmentId: string, title: string): TestRecord {
    const now = new Date().toISOString();
    const test = {
      id: randomUUID(),
      projectId,
      environmentId,
      title: title.trim(),
      createdAt: now,
      updatedAt: now,
    };
    this.database
      .prepare(
        `INSERT INTO tests (id, project_id, environment_id, title, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(test.id, projectId, environmentId, test.title, now, now);
    return test;
  }

  renameTest(testId: string, title: string): void {
    this.database
      .prepare('UPDATE tests SET title = ?, updated_at = ? WHERE id = ?')
      .run(title.trim(), new Date().toISOString(), testId);
  }

  loadSteps(testId: string): Step[] {
    return this.database
      .prepare('SELECT payload FROM test_steps WHERE test_id = ? ORDER BY position')
      .all(testId)
      .map((row) => redactStepSecrets(stepSchema.parse(JSON.parse(String(row.payload)))));
  }

  replaceSteps(testId: string, steps: readonly Step[]): void {
    const validated = steps.map((step) => redactStepSecrets(stepSchema.parse(step)));
    const remove = this.database.prepare('DELETE FROM test_steps WHERE test_id = ?');
    const insert = this.database.prepare(
      'INSERT INTO test_steps (test_id, position, payload) VALUES (?, ?, ?)',
    );
    this.database.exec('BEGIN IMMEDIATE');
    try {
      remove.run(testId);
      validated.forEach((step, position) => insert.run(testId, position, JSON.stringify(step)));
      this.database
        .prepare('UPDATE tests SET updated_at = ? WHERE id = ?')
        .run(new Date().toISOString(), testId);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
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
    migrations.slice(current).forEach((sql, offset) => {
      const version = current + offset + 1;
      this.database.exec('BEGIN IMMEDIATE');
      try {
        this.database.exec(sql);
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
