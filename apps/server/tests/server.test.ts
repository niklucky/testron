import { randomUUID } from 'node:crypto';

import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { MutationMetadata, RequestMetadata, TestRevisionContent } from '@testron/protocol';
import type { AppRouter } from '../src/trpc/router.js';
import { startTestronServer, type RunningTestronServer } from '../src/server.js';

const databaseUrl =
  process.env.TESTRON_TEST_DATABASE_URL ?? 'postgresql://testron:testron@127.0.0.1:55432/testron';
let server: RunningTestronServer;

beforeAll(async () => {
  server = await startTestronServer({ databaseUrl });
});

beforeEach(async () => {
  await server.database.db.execute(sql`
    truncate table idempotency_records, test_revisions, tests, environments, projects,
      sessions, users restart identity cascade
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
    const slice = await createSlice(api);
    const workspace = await api.workspace.get.query({ meta: requestMeta() });
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
