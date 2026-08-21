import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
let webappDirectory: string;
const deliveredInvitationIds: string[] = [];

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
  webappDirectory = await mkdtemp(path.join(tmpdir(), 'testron-webapp-'));
  await mkdir(path.join(webappDirectory, 'assets'));
  await writeFile(path.join(webappDirectory, 'index.html'), '<main>Testron webapp</main>');
  await writeFile(path.join(webappDirectory, 'assets', 'app.js'), 'export {};');
  server = await startTestronServer({
    databaseUrl,
    migrate: false,
    invitationMailer: {
      sendInvitation: async (invitation) => {
        deliveredInvitationIds.push(invitation.id);
      },
    },
    webappDirectory,
  });
  await assertIsolatedTestDatabase();
  await server.database.migrate(fileURLToPath(new URL('../drizzle', import.meta.url)));
});

beforeEach(async () => {
  deliveredInvitationIds.length = 0;
  await assertIsolatedTestDatabase();
  await server.database.db.execute(sql`
    truncate table idempotency_records, project_activity, test_runs, test_revisions, tests, test_suites, environments,
      projects, sessions, users restart identity cascade
  `);
});

afterAll(async () => {
  await server.close();
  await rm(webappDirectory, { recursive: true });
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
  prerequisites: [],
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
        url: `${server.url}/api/trpc`,
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
    ],
  });

const signIn = async (email = 'owner@example.test', password = 'correct horse battery staple') => {
  const session = await client().auth.register.mutate({ name: 'Test Owner', email, password });
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
  it('serves health checks under the canonical API prefix', async () => {
    const response = await fetch(`${server.url}/api/health`);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.status).toBe(200);
  });

  it('serves webapp assets and falls back to the SPA entry point', async () => {
    const entry = await fetch(`${server.url}/projects/example`);
    expect(await entry.text()).toContain('Testron webapp');
    expect(entry.headers.get('cache-control')).toBe('no-cache');

    const asset = await fetch(`${server.url}/assets/app.js`);
    expect(await asset.text()).toBe('export {};');
    expect(asset.headers.get('cache-control')).toContain('immutable');
    expect((await fetch(`${server.url}/assets/missing.js`)).status).toBe(404);
  });

  it('registers and logs in without a browser device flow', async () => {
    const email = 'owner@example.test';
    const password = 'correct horse battery staple';
    const registration = await client().auth.register.mutate({ name: 'Nikita', email, password });
    await expect(
      client().auth.register.mutate({ name: 'Nikita', email, password }),
    ).rejects.toMatchObject({
      data: { code: 'CONFLICT' },
    });
    await expect(
      client().auth.login.mutate({ email, password: 'incorrect password value' }),
    ).rejects.toMatchObject({ data: { code: 'UNAUTHORIZED' } });
    const login = await client().auth.login.mutate({ email, password });
    expect(login.accessToken).not.toBe(registration.accessToken);
    await expect(
      client(login.accessToken).workspace.get.query({ meta: requestMeta() }),
    ).resolves.toMatchObject({ viewer: { name: 'Nikita', email }, projects: [] });
  });

  it('authenticates browser requests with an HttpOnly session cookie', async () => {
    let cookie: string | undefined;
    const browser = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `${server.url}/api/trpc`,
          fetch: async (input, init) => {
            const response = await fetch(input, init as RequestInit);
            cookie = response.headers.get('set-cookie')?.split(';')[0];
            return response;
          },
        }),
      ],
    });
    await browser.auth.register.mutate({
      name: 'Browser User',
      email: 'browser@example.test',
      password: 'correct horse battery staple',
    });
    expect(cookie).toMatch(/^testron_session=/);
    expect(cookie).not.toContain('Bearer');

    const cookieClient = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `${server.url}/api/trpc`,
          headers: () => ({ cookie: cookie ?? '' }),
        }),
      ],
    });
    await expect(cookieClient.workspace.get.query({ meta: requestMeta() })).resolves.toMatchObject({
      viewer: { email: 'browser@example.test' },
    });

    const project = await cookieClient.project.create.mutate({
      meta: mutationMeta(),
      name: 'Browser project',
    });
    const environment = await cookieClient.environment.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      name: 'Production',
      baseUrl: 'https://example.test/',
      testIdAttribute: 'data-testid',
    });
    await cookieClient.profile.create.mutate({
      meta: mutationMeta(),
      environmentId: environment.id,
      name: 'Admin',
      authenticationType: 'credentials',
      variables: [{ name: 'PASSWORD', value: 'never-send-this', sensitive: true }],
    });
    const webWorkspace = await cookieClient.workspace.getWeb.query({ meta: requestMeta() });
    expect(webWorkspace.profiles[0]?.variables).toEqual([{ name: 'PASSWORD', sensitive: true }]);
    expect(JSON.stringify(webWorkspace)).not.toContain('never-send-this');

    const logout = await fetch(`${server.url}/api/auth/logout`, {
      method: 'POST',
      headers: { cookie: cookie ?? '' },
    });
    expect(logout.status).toBe(204);
    await expect(cookieClient.workspace.get.query({ meta: requestMeta() })).rejects.toMatchObject({
      data: { code: 'UNAUTHORIZED' },
    });
  });

  it('updates the account name and changes the password after verifying the current password', async () => {
    const email = 'owner@example.test';
    const password = 'correct horse battery staple';
    const { api } = await signIn(email, password);

    await expect(
      api.account.updateProfile.mutate({ meta: mutationMeta(), name: 'Updated Owner' }),
    ).resolves.toMatchObject({ email, name: 'Updated Owner' });
    await expect(api.workspace.get.query({ meta: requestMeta() })).resolves.toMatchObject({
      viewer: { email, name: 'Updated Owner' },
    });

    await expect(
      api.account.changePassword.mutate({
        meta: mutationMeta(),
        currentPassword: 'incorrect password value',
        newPassword: 'brand new correct horse password',
      }),
    ).rejects.toMatchObject({ data: { code: 'UNAUTHORIZED' } });

    await expect(
      api.account.changePassword.mutate({
        meta: mutationMeta(),
        currentPassword: password,
        newPassword: 'brand new correct horse password',
      }),
    ).resolves.toEqual({ changed: true, sessionPolicy: 'preserve' });
    await expect(client().auth.login.mutate({ email, password })).rejects.toMatchObject({
      data: { code: 'UNAUTHORIZED' },
    });
    await expect(
      client().auth.login.mutate({ email, password: 'brand new correct horse password' }),
    ).resolves.toHaveProperty('accessToken');
    await expect(api.workspace.get.query({ meta: requestMeta() })).resolves.toHaveProperty(
      'viewer.email',
      email,
    );
  });

  it('supports invitation acceptance, member access, blocking, and unblocking', async () => {
    const owner = await signIn();
    const { project, snapshot } = await createSlice(owner.api);
    const member = await signIn('member@example.test', 'another correct horse password');

    await expect(
      owner.api.invitation.lookup.query({
        meta: requestMeta(),
        email: 'MEMBER@example.test',
      }),
    ).resolves.toEqual({ email: 'member@example.test', name: 'Test Owner' });
    const invitation = await owner.api.invitation.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      email: 'member@example.test',
    });
    expect(invitation).toMatchObject({
      projectId: project.id,
      inviteeName: 'Test Owner',
      status: 'invited',
    });
    expect(deliveredInvitationIds).toContain(invitation.id);
    await expect(member.api.workspace.get.query({ meta: requestMeta() })).resolves.toMatchObject({
      projects: [],
      pendingInvitations: [{ id: invitation.id, status: 'invited' }],
    });

    await expect(
      member.api.invitation.respond.mutate({
        meta: mutationMeta(),
        invitationId: invitation.id,
        response: 'accepted',
      }),
    ).resolves.toMatchObject({ status: 'accepted' });
    await expect(member.api.workspace.get.query({ meta: requestMeta() })).resolves.toMatchObject({
      projects: [{ id: project.id }],
      pendingInvitations: [],
    });
    await expect(
      member.api.test.get.query({ meta: requestMeta(), testId: snapshot.test.id }),
    ).resolves.toMatchObject({ test: { id: snapshot.test.id } });

    await expect(
      owner.api.member.setBlocked.mutate({
        meta: mutationMeta(),
        projectId: project.id,
        userId: (await member.api.workspace.get.query({ meta: requestMeta() })).viewer.id,
        blocked: true,
      }),
    ).resolves.toMatchObject({ status: 'blocked' });
    await expect(member.api.workspace.get.query({ meta: requestMeta() })).resolves.toMatchObject({
      projects: [],
    });
    await expect(
      member.api.test.get.query({ meta: requestMeta(), testId: snapshot.test.id }),
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });

    const memberId = (await member.api.workspace.get.query({ meta: requestMeta() })).viewer.id;
    await owner.api.member.setBlocked.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      userId: memberId,
      blocked: false,
    });
    await expect(member.api.workspace.get.query({ meta: requestMeta() })).resolves.toMatchObject({
      projects: [{ id: project.id }],
    });
  });

  it('supports invitation rejection and inviter cancellation', async () => {
    const owner = await signIn();
    const project = await owner.api.project.create.mutate({
      meta: mutationMeta(),
      name: 'Website',
    });
    const invitee = await signIn('invitee@example.test', 'another correct horse password');

    const rejected = await owner.api.invitation.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      email: 'invitee@example.test',
    });
    await expect(
      invitee.api.invitation.respond.mutate({
        meta: mutationMeta(),
        invitationId: rejected.id,
        response: 'rejected',
      }),
    ).resolves.toMatchObject({ status: 'rejected' });
    await expect(invitee.api.workspace.get.query({ meta: requestMeta() })).resolves.toMatchObject({
      projects: [],
      pendingInvitations: [],
    });

    const pending = await owner.api.invitation.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      email: 'future-member@example.test',
    });
    await expect(
      owner.api.invitation.cancel.mutate({
        meta: mutationMeta(),
        invitationId: pending.id,
      }),
    ).resolves.toMatchObject({ status: 'cancelled' });
    await expect(owner.api.workspace.get.query({ meta: requestMeta() })).resolves.toMatchObject({
      invitations: expect.arrayContaining([
        expect.objectContaining({ id: rejected.id, status: 'rejected' }),
        expect.objectContaining({ id: pending.id, status: 'cancelled' }),
      ]),
    });
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
      latestTestRuns: {
        [failedTest.test.id]: { status: 'failed', durationMs: 500 },
        [passedTest.test.id]: { status: 'passed', durationMs: 750 },
      },
      projectOverviews: [
        {
          projectId: project.id,
          suiteCount: 1,
          testCount: 2,
          passedCount: 1,
          failedCount: 1,
          noResultCount: 0,
          runCount30d: 2,
          activeRunCount: 0,
          lastRunAt: expect.any(String),
        },
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

  it('moves a test to another project and suite with a new current revision', async () => {
    const { api } = await signIn();
    const source = await api.project.create.mutate({ meta: mutationMeta(), name: 'Source' });
    const destination = await api.project.create.mutate({
      meta: mutationMeta(),
      name: 'Destination',
    });
    const sourceEnvironment = await api.environment.create.mutate({
      meta: mutationMeta(),
      projectId: source.id,
      name: 'Production',
      baseUrl: 'https://source.example.test/',
      testIdAttribute: 'data-testid',
    });
    const destinationEnvironment = await api.environment.create.mutate({
      meta: mutationMeta(),
      projectId: destination.id,
      name: 'Production',
      baseUrl: 'https://destination.example.test/',
      testIdAttribute: 'data-testid',
    });
    const suite = await api.testSuite.create.mutate({
      meta: mutationMeta(),
      projectId: destination.id,
      name: 'Moved tests',
    });
    const snapshot = await api.test.create.mutate({
      meta: mutationMeta(),
      projectId: source.id,
      content: content(sourceEnvironment.id, 'Movable test'),
    });

    const moved = await api.test.move.mutate({
      meta: mutationMeta(),
      testId: snapshot.test.id,
      baseRevision: snapshot.test.currentRevision,
      projectId: destination.id,
      testSuiteId: suite.id,
      environmentId: destinationEnvironment.id,
    });

    expect(moved).toMatchObject({
      test: {
        id: snapshot.test.id,
        projectId: destination.id,
        testSuiteId: suite.id,
        currentRevision: { number: 2 },
      },
      currentRevision: {
        projectId: destination.id,
        number: 2,
        content: { environmentId: destinationEnvironment.id, title: 'Movable test' },
      },
    });
    const workspace = await api.workspace.get.query({ meta: requestMeta() });
    expect(workspace.tests).toEqual([
      expect.objectContaining({
        test: expect.objectContaining({ projectId: destination.id, testSuiteId: suite.id }),
      }),
    ]);
    await expect(
      api.test.move.mutate({
        meta: mutationMeta(),
        testId: snapshot.test.id,
        baseRevision: snapshot.test.currentRevision,
        projectId: destination.id,
        testSuiteId: suite.id,
        environmentId: destinationEnvironment.id,
      }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } });
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
      projectOverviews: [{ projectId: snapshot.test.projectId, activeRunCount: 1 }],
    });

    const finished = await api.run.finish.mutate({
      meta: mutationMeta(),
      runId: run.id,
      status: 'failed',
      durationMs: 1_250,
      error: "expect(locator).toBeHidden() failed\nfailedLocator: getByTestId('login-button')",
    });
    expect(finished).toMatchObject({
      status: 'failed',
      durationMs: 1_250,
      error: "expect(locator).toBeHidden() failed\nfailedLocator: getByTestId('login-button')",
    });
    await expect(api.workspace.get.query({ meta: requestMeta() })).resolves.toMatchObject({
      activeRuns: [],
      recentRuns: [{ id: run.id, error: expect.stringContaining('login-button') }],
      projectOverviews: [{ projectId: snapshot.test.projectId, activeRunCount: 0 }],
    });
  });

  it('records one authorized, newest-first activity event for each supported mutation', async () => {
    const owner = await signIn();
    const project = await owner.api.project.create.mutate({
      meta: mutationMeta(),
      name: 'Activity project',
    });
    const environment = await owner.api.environment.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      name: 'Production',
      baseUrl: 'https://example.test/',
      testIdAttribute: 'data-testid',
    });
    const member = await signIn('activity-member@example.test', 'another correct horse password');
    const invitation = await owner.api.invitation.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      email: 'activity-member@example.test',
    });
    await member.api.invitation.respond.mutate({
      meta: mutationMeta(),
      invitationId: invitation.id,
      response: 'accepted',
    });

    const createSuiteKey = randomUUID();
    const suiteRequest = {
      meta: mutationMeta(createSuiteKey),
      projectId: project.id,
      name: 'Original suite',
    };
    const suite = await owner.api.testSuite.create.mutate(suiteRequest);
    await owner.api.testSuite.create.mutate({
      ...suiteRequest,
      meta: { ...suiteRequest.meta, requestId: randomUUID() },
    });
    const updatedSuite = await owner.api.testSuite.update.mutate({
      meta: mutationMeta(),
      testSuiteId: suite.id,
      baseRevision: suite.revision,
      name: 'Renamed suite',
    });
    const snapshot = await owner.api.test.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      testSuiteId: suite.id,
      content: content(environment.id, 'Original test'),
    });
    const saved = await owner.api.test.saveRevision.mutate({
      meta: mutationMeta(),
      testId: snapshot.test.id,
      baseRevision: snapshot.test.currentRevision,
      content: content(environment.id, 'Renamed test'),
    });
    if (saved.status !== 'saved') throw new Error('Expected the test update to save.');
    await owner.api.test.delete.mutate({
      meta: mutationMeta(),
      testId: snapshot.test.id,
      baseRevision: saved.snapshot.test.currentRevision,
    });
    await owner.api.testSuite.delete.mutate({
      meta: mutationMeta(),
      testSuiteId: suite.id,
      baseRevision: updatedSuite.revision,
    });

    const workspace = await owner.api.workspace.get.query({ meta: requestMeta() });
    expect(workspace.deletedTestSuites).toEqual([
      expect.objectContaining({
        id: suite.id,
        name: 'Renamed suite',
        deletion: expect.objectContaining({ status: 'deleted' }),
      }),
    ]);
    expect(workspace.deletedTests).toEqual([
      expect.objectContaining({
        test: expect.objectContaining({
          id: snapshot.test.id,
          title: 'Renamed test',
          deletion: expect.objectContaining({ status: 'deleted' }),
        }),
      }),
    ]);
    expect(workspace.recentActivity.map((activity) => activity.action).sort()).toEqual(
      [
        'member.invited',
        'member.invitationAccepted',
        'test.created',
        'test.updated',
        'test.deleted',
        'testSuite.created',
        'testSuite.updated',
        'testSuite.deleted',
      ].sort(),
    );
    expect(
      workspace.recentActivity.every(
        (activity, index, events) =>
          index === 0 || Date.parse(events[index - 1]!.createdAt) >= Date.parse(activity.createdAt),
      ),
    ).toBe(true);
    expect(
      workspace.recentActivity.find((activity) => activity.action === 'test.deleted'),
    ).toMatchObject({
      entity: { label: 'Renamed test' },
    });
    expect(
      workspace.recentActivity.find((activity) => activity.action === 'testSuite.deleted'),
    ).toMatchObject({ entity: { label: 'Renamed suite' } });

    await expect(member.api.workspace.get.query({ meta: requestMeta() })).resolves.toMatchObject({
      recentActivity: expect.arrayContaining([
        expect.objectContaining({ action: 'member.invitationAccepted' }),
      ]),
    });
    const stranger = await signIn(
      'activity-stranger@example.test',
      'another correct horse password',
    );
    await expect(stranger.api.workspace.get.query({ meta: requestMeta() })).resolves.toMatchObject({
      recentActivity: [],
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
