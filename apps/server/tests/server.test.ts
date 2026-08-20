import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { MutationMetadata, RequestMetadata, TestRevisionContent } from '@testron/protocol';
import type { AppRouter } from '../src/trpc/router.js';
import { startTestronServer, type RunningTestronServer } from '../src/server.js';

const databaseUrl = 'postgresql://testron_test:testron_test@127.0.0.1:55433/testron_test' as const;
const expectedDatabase = 'testron_test';
const expectedUser = 'testron_test';
let server: RunningTestronServer;

const assertIsolatedTestDatabase = async (): Promise<void> => {
  const result = await server.database.pool.query<{
    database: string;
    databaseUser: string;
  }>('select current_database() as database, current_user as "databaseUser"');
  const identity = result.rows[0];
  if (identity?.database === expectedDatabase && identity.databaseUser === expectedUser) return;
  throw new Error(
    `Refusing destructive test cleanup on database ${identity?.database ?? 'unknown'} as ${identity?.databaseUser ?? 'unknown'}.`,
  );
};

beforeAll(async () => {
  server = await startTestronServer({ databaseUrl, migrate: false });
  await assertIsolatedTestDatabase();
  await server.database.migrate(fileURLToPath(new URL('../drizzle', import.meta.url)));
});

beforeEach(async () => {
  await assertIsolatedTestDatabase();
  await server.database.db.execute(sql`
    truncate table idempotency_records, test_runs, test_revisions, tests, test_suites, environments,
      projects, sessions, users restart identity cascade
  `);
});

afterAll(async () => {
  await server.close();
});

const requestMeta = (): RequestMetadata => ({
  protocolVersion: 1,
  requestId: randomUUID(),
  client: { kind: 'desktop', version: '0.0.1' },
  supportedStepVersions: [1],
});
const mutationMeta = (key = randomUUID()): MutationMetadata => ({
  ...requestMeta(),
  idempotencyKey: key,
});
const content = (environmentId: string, title: string): TestRevisionContent => ({
  stepSchemaVersion: 1,
  title,
  environmentId,
  steps: [
    {
      id: randomUUID(),
      payload: {
        version: 1,
        kind: 'navigate',
        url: 'https://example.test/',
        metadata: { recordedAt: '2026-01-01T00:00:00.000Z' },
      },
    },
  ],
});

const client = (token?: string) =>
  createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${server.url}/trpc`,
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
    ],
  });

const signIn = async (email = 'owner@example.test', password = 'correct horse battery staple') => {
  const session = await client().auth.register.mutate({ email, password });
  return { token: session.accessToken, api: client(session.accessToken) };
};

const createSlice = async (api: ReturnType<typeof client>) => {
  const project = await api.project.create.mutate({ meta: mutationMeta(), name: 'Checkout' });
  const environment = await api.environment.create.mutate({
    meta: mutationMeta(),
    projectId: project.id,
    name: 'Production',
    baseUrl: 'https://example.test/',
    testIdAttribute: 'data-testid',
  });
  const snapshot = await api.test.create.mutate({
    meta: mutationMeta(),
    projectId: project.id,
    content: content(environment.id, 'checkout'),
  });
  return { project, environment, snapshot };
};

describe('PostgreSQL tRPC vertical slice', () => {
  it('registers and logs in without a browser device flow', async () => {
    const email = 'owner@example.test';
    const password = 'correct horse battery staple';
    const registration = await client().auth.register.mutate({ email, password });
    await expect(client().auth.register.mutate({ email, password })).rejects.toMatchObject({
      data: { code: 'CONFLICT' },
    });
    await expect(
      client().auth.login.mutate({ email, password: 'incorrect password value' }),
    ).rejects.toMatchObject({ data: { code: 'UNAUTHORIZED' } });
    const login = await client().auth.login.mutate({ email, password });
    expect(login.accessToken).not.toBe(registration.accessToken);
    await expect(
      client(login.accessToken).workspace.get.query({ meta: requestMeta() }),
    ).resolves.toMatchObject({ projects: [] });
  });

  it('authenticates every protected procedure and hydrates the typed workspace', async () => {
    await expect(client().workspace.get.query({ meta: requestMeta() })).rejects.toMatchObject({
      data: { code: 'UNAUTHORIZED' },
    });
    const { api } = await signIn();
    await server.database.db.execute(
      sql`update users set name = 'Nikita' where email = 'owner@example.test'`,
    );
    const slice = await createSlice(api);
    const workspace = await api.workspace.get.query({ meta: requestMeta() });
    expect(workspace.viewer).toEqual({
      id: slice.project.ownerId,
      email: 'owner@example.test',
      name: 'Nikita',
    });
    expect(workspace.projects).toEqual([slice.project]);
    expect(workspace.environments).toEqual([slice.environment]);
    expect(workspace.tests).toEqual([slice.snapshot]);
  });

  it('serializes revisions and returns a typed conflict without overwriting', async () => {
    const { api } = await signIn();
    const { environment, snapshot } = await createSlice(api);
    const baseRevision = snapshot.test.currentRevision;
    const saved = await api.test.saveRevision.mutate({
      meta: mutationMeta(),
      testId: snapshot.test.id,
      baseRevision,
      content: content(environment.id, 'checkout with a coupon'),
    });
    expect(saved.status).toBe('saved');
    if (saved.status !== 'saved') throw new Error('Expected a saved revision.');
    expect(saved.snapshot.test.title).toBe('checkout with a coupon');
    expect(saved.snapshot.currentRevision.number).toBe(2);
    expect(saved.snapshot.currentRevision.parentRevision).toEqual(baseRevision);

    const conflict = await api.test.saveRevision.mutate({
      meta: mutationMeta(),
      testId: snapshot.test.id,
      baseRevision,
      content: content(environment.id, 'stale title'),
    });
    expect(conflict.status).toBe('conflict');
    if (conflict.status !== 'conflict') throw new Error('Expected a revision conflict.');
    expect(conflict.current.currentRevision.content.title).toBe('checkout with a coupon');
    const history = await api.test.history.query({
      meta: requestMeta(),
      testId: snapshot.test.id,
      limit: 50,
    });
    expect(history.revisions.map((revision) => revision.number)).toEqual([1, 2]);
  });

  it('updates project and environment settings on the server', async () => {
    const { api } = await signIn();
    const { project, environment } = await createSlice(api);
    const updatedProject = await api.project.update.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      baseRevision: project.revision,
      name: 'Checkout web',
      url: 'https://checkout.example.test/',
    });
    const updatedEnvironment = await api.environment.update.mutate({
      meta: mutationMeta(),
      environmentId: environment.id,
      baseRevision: environment.revision,
      name: 'Staging',
      baseUrl: 'https://staging.example.test/',
    });

    expect(updatedProject).toMatchObject({
      name: 'Checkout web',
      url: 'https://checkout.example.test/',
      revision: 2,
    });
    expect(updatedEnvironment).toMatchObject({
      name: 'Staging',
      baseUrl: 'https://staging.example.test/',
      revision: 2,
    });
    await expect(api.workspace.get.query({ meta: requestMeta() })).resolves.toMatchObject({
      projects: [{ id: project.id, name: 'Checkout web' }],
      environments: [{ id: environment.id, name: 'Staging' }],
    });
    await expect(
      api.project.update.mutate({
        meta: mutationMeta(),
        projectId: project.id,
        baseRevision: project.revision,
        name: 'Stale write',
        url: null,
      }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } });
  });

  it('creates and updates environment profiles on the server', async () => {
    const { api } = await signIn();
    const { environment } = await createSlice(api);
    const profile = await api.profile.create.mutate({
      meta: mutationMeta(),
      environmentId: environment.id,
      name: 'Administrator',
      authenticationType: 'credentials',
      variables: [
        { name: 'username', value: 'admin@example.test', sensitive: false },
        { name: 'password', value: 'secret value', sensitive: true },
      ],
    });

    expect(profile).toMatchObject({
      environmentId: environment.id,
      name: 'Administrator',
      revision: 1,
    });
    await expect(api.workspace.get.query({ meta: requestMeta() })).resolves.toMatchObject({
      profiles: [{ id: profile.id, variables: expect.arrayContaining(profile.variables) }],
    });

    const updated = await api.profile.update.mutate({
      meta: mutationMeta(),
      profileId: profile.id,
      baseRevision: profile.revision,
      name: 'QA administrator',
      authenticationType: 'credentials',
      variables: [
        { name: 'username', value: 'qa@example.test', sensitive: false },
        { name: 'password', value: 'new secret value', sensitive: true },
      ],
    });
    expect(updated).toMatchObject({ name: 'QA administrator', revision: 2 });
    expect(updated.variables).toEqual(
      expect.arrayContaining([
        { name: 'username', value: 'qa@example.test', sensitive: false },
        { name: 'password', value: 'new secret value', sensitive: true },
      ]),
    );
    await expect(
      api.profile.update.mutate({
        meta: mutationMeta(),
        profileId: profile.id,
        baseRevision: profile.revision,
        name: 'Stale profile',
        authenticationType: 'credentials',
        variables: [{ name: 'username', value: 'stale', sensitive: false }],
      }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } });
  });

  it('creates, reads, updates, counts, and soft-deletes test suites', async () => {
    const { api } = await signIn();
    const project = await api.project.create.mutate({ meta: mutationMeta(), name: 'Commerce' });
    const environment = await api.environment.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      name: 'Production',
      baseUrl: 'https://example.test/',
      testIdAttribute: 'data-testid',
    });
    const testSuite = await api.testSuite.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      name: 'Checkout',
    });
    const failedTest = await api.test.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      testSuiteId: testSuite.id,
      content: content(environment.id, 'declined card'),
    });
    const passedTest = await api.test.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      testSuiteId: testSuite.id,
      content: content(environment.id, 'saved card'),
    });
    const run = await api.run.start.mutate({
      meta: mutationMeta(),
      testId: failedTest.test.id,
      environmentId: environment.id,
      source: 'desktop-local',
    });
    await api.run.finish.mutate({
      meta: mutationMeta(),
      runId: run.id,
      status: 'failed',
      durationMs: 500,
    });
    const passedRun = await api.run.start.mutate({
      meta: mutationMeta(),
      testId: passedTest.test.id,
      environmentId: environment.id,
      source: 'desktop-local',
    });
    await api.run.finish.mutate({
      meta: mutationMeta(),
      runId: passedRun.id,
      status: 'passed',
      durationMs: 750,
    });

    await expect(
      api.testSuite.list.query({ meta: requestMeta(), projectId: project.id }),
    ).resolves.toMatchObject([
      {
        id: testSuite.id,
        name: 'Checkout',
        testCount: 2,
        failedCount: 1,
        totalLatestDurationMs: 1_250,
      },
    ]);
    await expect(api.workspace.get.query({ meta: requestMeta() })).resolves.toMatchObject({
      testSuites: [
        { id: testSuite.id, testCount: 2, failedCount: 1, totalLatestDurationMs: 1_250 },
      ],
    });

    const updated = await api.testSuite.update.mutate({
      meta: mutationMeta(),
      testSuiteId: testSuite.id,
      baseRevision: testSuite.revision,
      name: 'Checkout critical path',
    });
    expect(updated).toMatchObject({ name: 'Checkout critical path', revision: 2 });
    await expect(
      api.testSuite.update.mutate({
        meta: mutationMeta(),
        testSuiteId: testSuite.id,
        baseRevision: testSuite.revision,
        name: 'Stale rename',
      }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } });

    const deleted = await api.testSuite.delete.mutate({
      meta: mutationMeta(),
      testSuiteId: testSuite.id,
      baseRevision: updated.revision,
    });
    expect(deleted.deletion).toMatchObject({ status: 'deleted' });
    await expect(
      api.testSuite.list.query({ meta: requestMeta(), projectId: project.id }),
    ).resolves.toEqual([]);
  });

  it('uses the server as the source of truth for local runs in flight', async () => {
    const { api } = await signIn();
    const { environment, snapshot } = await createSlice(api);
    const run = await api.run.start.mutate({
      meta: mutationMeta(),
      testId: snapshot.test.id,
      environmentId: environment.id,
      source: 'desktop-local',
    });

    expect(run).toMatchObject({
      testId: snapshot.test.id,
      environmentId: environment.id,
      status: 'running',
      source: 'desktop-local',
    });
    await expect(api.workspace.get.query({ meta: requestMeta() })).resolves.toMatchObject({
      activeRuns: [{ id: run.id, status: 'running' }],
    });

    const finished = await api.run.finish.mutate({
      meta: mutationMeta(),
      runId: run.id,
      status: 'passed',
      durationMs: 1_250,
    });
    expect(finished).toMatchObject({ status: 'passed', durationMs: 1_250 });
    await expect(api.workspace.get.query({ meta: requestMeta() })).resolves.toMatchObject({
      activeRuns: [],
    });
  });

  it('replays an identical idempotent mutation and rejects changed key reuse', async () => {
    const { api } = await signIn();
    const key = randomUUID();
    const request = { meta: mutationMeta(key), name: 'Checkout' };
    const first = await api.project.create.mutate(request);
    const retry = await api.project.create.mutate({
      ...request,
      meta: { ...request.meta, requestId: randomUUID() },
    });
    expect(retry.id).toBe(first.id);
    await expect(
      api.project.create.mutate({
        meta: { ...request.meta, requestId: randomUUID() },
        name: 'Different',
      }),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof TRPCClientError && error.data?.code === 'CONFLICT',
    );
  });

  it('enforces project ownership through nested test procedures', async () => {
    const owner = await signIn();
    const { snapshot } = await createSlice(owner.api);
    const stranger = await signIn('stranger@example.test', 'another correct horse password');
    await expect(
      stranger.api.test.get.query({ meta: requestMeta(), testId: snapshot.test.id }),
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
  });
});
