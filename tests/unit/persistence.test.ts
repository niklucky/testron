import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

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
    const test = repository.createTest(project.id, environment.id, 'submit an order');
    repository.replaceSteps(test.id, [
      {
        version: 1,
        kind: 'navigate',
        url: environment.baseUrl,
        metadata: { recordedAt: '2026-01-01T00:00:00.000Z' },
      },
    ]);
    repository.close();

    const reopened = new TestronRepository(databasePath);
    expect(reopened.listProjects()).toEqual([project]);
    expect(reopened.listEnvironments()).toEqual([environment]);
    expect(reopened.listTests()[0]).toMatchObject({ id: test.id, title: test.title });
    expect(reopened.loadSteps(test.id)).toHaveLength(1);
    reopened.close();
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
    const test = repository.createTest(project.id, environment.id, 'sign in');
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
});
