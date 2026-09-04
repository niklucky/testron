import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MutationMetadata, RequestMetadata, TestRevisionContent } from '@testron/protocol';
import type { PasswordResetEmail } from '../src/email.js';
import { AuthenticationService } from '../src/auth.js';
import type { AppRouter } from '../src/trpc/router.js';
import { startTestronServer, type RunningTestronServer } from '../src/server.js';
import { ServerRunQueue } from '../src/test-runs/queue.js';
import { ServerArtifactRetention } from '../src/test-runs/artifact-retention.js';
import type { ServerRunOptions, ServerRunResult } from '../src/test-runs/runner.js';
import { testRuns } from '../src/database/schema.js';

const databaseUrl = 'postgresql://testron_test:testron_test@127.0.0.1:55433/testron_test' as const;
const expectedDatabase = 'testron_test';
const expectedUser = 'testron_test';
let server: RunningTestronServer;
let webappDirectory: string;
let artifactsDirectory: string;
const deliveredInvitationIds: string[] = [];
const deliveredPasswordResets: PasswordResetEmail[] = [];

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
  artifactsDirectory = path.join(webappDirectory, 'artifacts');
  await mkdir(path.join(webappDirectory, 'assets'));
  await writeFile(path.join(webappDirectory, 'index.html'), '<main>Testron webapp</main>');
  await writeFile(path.join(webappDirectory, 'assets', 'app.js'), 'export {};');
  server = await startTestronServer({
    databaseUrl,
    migrate: false,
    runQueueEnabled: false,
    authenticationEncryptionKeys: `1:${Buffer.alloc(32, 7).toString('base64')}`,
    invitationMailer: {
      sendInvitation: async (invitation) => {
        deliveredInvitationIds.push(invitation.id);
      },
    },
    passwordResetMailer: {
      sendPasswordReset: async (message) => {
        deliveredPasswordResets.push(message);
      },
    },
    webappDirectory,
    artifactsDirectory,
  });
  await assertIsolatedTestDatabase();
  await server.database.migrate(fileURLToPath(new URL('../drizzle', import.meta.url)));
});

beforeEach(async () => {
  deliveredInvitationIds.length = 0;
  deliveredPasswordResets.length = 0;
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
  environmentIds: [environmentId],
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
  it('rejects Resend delivery without a public reset URL before connecting to the database', async () => {
    await expect(
      startTestronServer({
        databaseUrl: 'postgresql://invalid:invalid@127.0.0.1:1/invalid',
        resend: { apiKey: 're_test', from: 'Testron <accounts@example.test>' },
      }),
    ).rejects.toThrow(
      'TESTRON_PUBLIC_URL is required when password-reset email delivery is enabled.',
    );
  });

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

  it('resets a password with an expiring single-use email token and revokes existing sessions', async () => {
    const email = 'reset@example.test';
    const password = 'correct horse battery staple';
    const registration = await client().auth.register.mutate({
      name: 'Reset User',
      email,
      password,
    });

    await expect(
      client().auth.requestPasswordReset.mutate({ email: 'missing@example.test' }),
    ).resolves.toEqual({ accepted: true });
    expect(deliveredPasswordResets).toHaveLength(0);

    await expect(client().auth.requestPasswordReset.mutate({ email })).resolves.toEqual({
      accepted: true,
    });
    await server.authentication.deliverPendingPasswordResets();
    expect(deliveredPasswordResets).toHaveLength(1);
    const resetUrl = new URL(deliveredPasswordResets[0]!.resetUrl);
    expect(resetUrl.origin).toBe('http://localhost');
    expect(resetUrl.pathname).toBe('/reset-password');
    const expiredToken = resetUrl.searchParams.get('token');
    expect(expiredToken).toBeTruthy();

    await server.database.db.execute(sql`
      update password_reset_tokens set expires_at = now() - interval '1 minute'
    `);
    await expect(
      client().auth.resetPassword.mutate({
        token: expiredToken!,
        newPassword: 'new secure password',
      }),
    ).rejects.toMatchObject({ data: { code: 'UNAUTHORIZED' } });

    await client().auth.requestPasswordReset.mutate({ email });
    await server.authentication.deliverPendingPasswordResets();
    const token = new URL(deliveredPasswordResets[1]!.resetUrl).searchParams.get('token');
    expect(token).toBeTruthy();

    await expect(
      client().auth.resetPassword.mutate({
        token: 'x'.repeat(43),
        newPassword: 'new secure password',
      }),
    ).rejects.toMatchObject({ data: { code: 'UNAUTHORIZED' } });
    await expect(
      client().auth.resetPassword.mutate({ token: token!, newPassword: 'new secure password' }),
    ).resolves.toEqual({ changed: true });
    await expect(
      client(registration.accessToken).workspace.get.query({ meta: requestMeta() }),
    ).rejects.toMatchObject({ data: { code: 'UNAUTHORIZED' } });
    await expect(client().auth.login.mutate({ email, password })).rejects.toMatchObject({
      data: { code: 'UNAUTHORIZED' },
    });
    await expect(
      client().auth.login.mutate({ email, password: 'new secure password' }),
    ).resolves.toHaveProperty('accessToken');
    await expect(
      client().auth.resetPassword.mutate({ token: token!, newPassword: 'another password' }),
    ).rejects.toMatchObject({ data: { code: 'UNAUTHORIZED' } });

    await client().auth.requestPasswordReset.mutate({ email });
    await server.authentication.deliverPendingPasswordResets();
    await client().auth.requestPasswordReset.mutate({ email });
    await server.authentication.deliverPendingPasswordResets();
    expect(deliveredPasswordResets).toHaveLength(3);
  });

  it('keeps failed password-reset emails in the durable outbox for retry', async () => {
    const email = 'retry-reset@example.test';
    await client().auth.register.mutate({
      name: 'Retry Reset User',
      email,
      password: 'correct horse battery staple',
    });
    const deliveryError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const authentication = new AuthenticationService(
      server.database.db,
      { sendPasswordReset: async () => Promise.reject(new Error('provider unavailable')) },
      'https://testron.example.test',
    );

    await authentication.requestPasswordReset({ email });
    await authentication.deliverPendingPasswordResets();

    const result = await server.database.pool.query<{ attempts: number }>(
      'select attempts from password_reset_email_outbox',
    );
    expect(result.rows).toEqual([{ attempts: 1 }]);
    expect(deliveryError).toHaveBeenCalled();
    deliveryError.mockRestore();
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
      projectId: project.id,
      name: 'Admin',
      authenticationType: 'credentials',
      environments: [
        {
          environmentId: environment.id,
          variables: [{ name: 'PASSWORD', value: 'never-send-this', sensitive: true }],
        },
      ],
    });
    const webWorkspace = await cookieClient.workspace.getWeb.query({ meta: requestMeta() });
    expect(webWorkspace.profiles[0]?.environments[0]?.variables).toEqual([
      { name: 'PASSWORD', sensitive: true },
    ]);
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

  it('reads legacy single-environment revisions while the data migration is rolling out', async () => {
    const { api } = await signIn();
    const { snapshot, environment } = await createSlice(api);
    await server.database.db.execute(sql`
      update test_revisions
      set content = (content - 'environmentIds') ||
        jsonb_build_object('environmentId', content -> 'environmentIds' -> 0)
      where id = ${snapshot.currentRevision.id}
    `);

    await expect(api.workspace.getWeb.query({ meta: requestMeta() })).resolves.toMatchObject({
      tests: [
        {
          currentRevision: { content: { environmentIds: [environment.id] } },
        },
      ],
    });
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
    const { project, environment } = await createSlice(api);
    const development = await api.environment.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      name: 'Development',
      baseUrl: 'https://dev.example.test/',
      testIdAttribute: 'data-testid',
    });
    const profile = await api.profile.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      name: 'Administrator',
      authenticationType: 'credentials',
      environments: [
        {
          environmentId: development.id,
          variables: [
            { name: 'username', value: 'admin', sensitive: false },
            { name: 'password', value: 'dev secret', sensitive: true },
          ],
        },
        {
          environmentId: environment.id,
          variables: [
            { name: 'username', value: 'admin@example.test', sensitive: false },
            { name: 'password', value: 'secret value', sensitive: true },
          ],
        },
      ],
    });

    expect(profile).toMatchObject({
      projectId: project.id,
      name: 'Administrator',
      revision: 1,
    });
    expect(profile.environments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          environmentId: development.id,
          variables: expect.arrayContaining([
            expect.objectContaining({ name: 'username', value: 'admin' }),
          ]),
        }),
        expect.objectContaining({
          environmentId: environment.id,
          variables: expect.arrayContaining([
            expect.objectContaining({ name: 'username', value: 'admin@example.test' }),
          ]),
        }),
      ]),
    );
    await expect(api.workspace.get.query({ meta: requestMeta() })).resolves.toMatchObject({
      profiles: [{ id: profile.id, environments: profile.environments }],
    });

    const updated = await api.profile.update.mutate({
      meta: mutationMeta(),
      profileId: profile.id,
      baseRevision: profile.revision,
      name: 'QA administrator',
      authenticationType: 'credentials',
      environmentId: environment.id,
      variables: [
        { name: 'username', value: 'qa@example.test', sensitive: false },
        { name: 'password', value: 'new secret value', sensitive: true },
      ],
    });
    expect(updated).toMatchObject({ name: 'QA administrator', revision: 2 });
    expect(updated.environments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          environmentId: development.id,
          variables: expect.arrayContaining([
            expect.objectContaining({ name: 'username', value: 'admin' }),
          ]),
        }),
        expect.objectContaining({
          environmentId: environment.id,
          variables: expect.arrayContaining([
            { name: 'username', value: 'qa@example.test', sensitive: false },
            { name: 'password', value: 'new secret value', sensitive: true },
          ]),
        }),
      ]),
    );
    const cookieProfile = await api.profile.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      name: 'Cookie session',
      authenticationType: 'cookies',
      environments: [
        {
          environmentId: development.id,
          variables: [{ name: 'session', value: 'dev-cookie', sensitive: true }],
        },
      ],
    });
    expect(cookieProfile.authenticationType).toBe('cookies');
    const headerProfile = await api.profile.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      name: 'API token',
      authenticationType: 'headers',
      environments: [
        {
          environmentId: development.id,
          variables: [{ name: 'Authorization', value: 'Bearer secret', sensitive: true }],
        },
      ],
    });
    expect(headerProfile.authenticationType).toBe('headers');
    const renamedCookieProfile = await api.profile.update.mutate({
      meta: mutationMeta(),
      profileId: cookieProfile.id,
      baseRevision: cookieProfile.revision,
      name: 'Cookie session',
      authenticationType: 'cookies',
      environmentId: development.id,
      variables: [{ name: 'sid', value: 'dev-cookie', sensitive: true }],
    });
    expect(renamedCookieProfile.environments[0]?.variables).toEqual([
      { name: 'sid', value: 'dev-cookie', sensitive: true },
    ]);
    await expect(
      api.profile.update.mutate({
        meta: mutationMeta(),
        profileId: updated.id,
        baseRevision: updated.revision,
        name: 'Mismatched keys',
        authenticationType: 'credentials',
        environmentId: environment.id,
        variables: [{ name: 'token', value: 'different', sensitive: true }],
      }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } });
    await expect(
      api.profile.update.mutate({
        meta: mutationMeta(),
        profileId: profile.id,
        baseRevision: profile.revision,
        name: 'Stale profile',
        authenticationType: 'credentials',
        environmentId: environment.id,
        variables: [
          { name: 'username', value: 'stale', sensitive: false },
          { name: 'password', value: 'stale', sensitive: true },
        ],
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
      environmentIds: [destinationEnvironment.id],
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
        content: { environmentIds: [destinationEnvironment.id], title: 'Movable test' },
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
        environmentIds: [destinationEnvironment.id],
      }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } });
  });

  it('uses the server as the source of truth for local runs in flight', async () => {
    const { api } = await signIn();
    const { project, environment, snapshot } = await createSlice(api);
    const profile = await api.profile.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      name: 'Administrator',
      authenticationType: 'credentials',
      environments: [
        {
          environmentId: environment.id,
          variables: [{ name: 'username', value: 'admin', sensitive: false }],
        },
      ],
    });
    const run = await api.run.start.mutate({
      meta: mutationMeta(),
      testId: snapshot.test.id,
      environmentId: environment.id,
      profileId: profile.id,
      source: 'desktop-local',
    });

    expect(run).toMatchObject({
      testId: snapshot.test.id,
      environmentId: environment.id,
      profileId: profile.id,
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

    const unassignedEnvironment = await api.environment.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      name: 'Unassigned',
      baseUrl: 'https://unassigned.example.test/',
      testIdAttribute: 'data-testid',
    });
    await expect(
      api.run.start.mutate({
        meta: mutationMeta(),
        testId: snapshot.test.id,
        environmentId: unassignedEnvironment.id,
        source: 'desktop-local',
      }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } });
  });

  it('serves run artifacts only to users who can access the project', async () => {
    const { api, token } = await signIn();
    const { environment, snapshot } = await createSlice(api);
    const run = await api.run.start.mutate({
      meta: mutationMeta(),
      testId: snapshot.test.id,
      environmentId: environment.id,
      source: 'desktop-local',
    });
    await api.run.finish.mutate({
      meta: mutationMeta(),
      runId: run.id,
      status: 'failed',
      durationMs: 10,
    });
    const runDirectory = path.join(artifactsDirectory, run.id);
    const screenshotPath = path.join(runDirectory, 'failure.png');
    await mkdir(runDirectory, { recursive: true });
    await writeFile(screenshotPath, 'png evidence');
    await server.database.db.execute(
      sql`update test_runs set screenshot_path = ${screenshotPath} where id = ${run.id}`,
    );

    const url = `${server.url}/api/runs/${run.id}/artifacts/screenshot`;
    await expect(fetch(url)).resolves.toMatchObject({ status: 401 });
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(await response.text()).toBe('png evidence');
    await expect(api.workspace.get.query({ meta: requestMeta() })).resolves.toMatchObject({
      recentRuns: [{ id: run.id, artifacts: { screenshot: true, video: false } }],
    });
    await rm(screenshotPath);
    await expect(
      fetch(url, { headers: { authorization: `Bearer ${token}` } }),
    ).resolves.toMatchObject({ status: 404 });
  });

  it('creates, updates, hydrates, and soft-deletes UTC run schedules', async () => {
    const { api } = await signIn();
    const { project, environment, snapshot } = await createSlice(api);
    const schedule = await api.runSchedule.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      name: 'Nightly checkout',
      cron: '0 1 * * *',
      environmentId: environment.id,
      testIds: [snapshot.test.id],
      enabled: false,
    });
    expect(schedule).toMatchObject({
      name: 'Nightly checkout',
      cron: '0 1 * * *',
      environmentId: environment.id,
      testIds: [snapshot.test.id],
      enabled: false,
      nextRunAt: null,
      revision: 1,
    });

    const updated = await api.runSchedule.update.mutate({
      meta: mutationMeta(),
      scheduleId: schedule.id,
      baseRevision: schedule.revision,
      name: 'Hourly checkout',
      cron: '0 * * * *',
      environmentId: environment.id,
      testIds: [snapshot.test.id],
      enabled: true,
    });
    expect(updated).toMatchObject({
      name: 'Hourly checkout',
      cron: '0 * * * *',
      enabled: true,
      nextRunAt: expect.any(String),
      revision: 2,
    });
    await expect(api.workspace.getWeb.query({ meta: requestMeta() })).resolves.toMatchObject({
      runSchedules: [{ id: schedule.id, testIds: [snapshot.test.id], enabled: true }],
      serverRunJobs: [],
    });

    const otherEnvironment = await api.environment.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      name: 'Other',
      baseUrl: 'https://other.example.test/',
      testIdAttribute: 'data-testid',
    });
    await expect(
      api.runSchedule.update.mutate({
        meta: mutationMeta(),
        scheduleId: schedule.id,
        baseRevision: updated.revision,
        name: updated.name,
        cron: updated.cron,
        environmentId: otherEnvironment.id,
        testIds: [snapshot.test.id],
        enabled: true,
      }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } });

    await api.runSchedule.delete.mutate({
      meta: mutationMeta(),
      scheduleId: schedule.id,
      baseRevision: updated.revision,
    });
    await expect(api.workspace.get.query({ meta: requestMeta() })).resolves.toMatchObject({
      runSchedules: [],
    });
  });

  it('runs manually enqueued schedule tests through the persistent FIFO queue', async () => {
    const { api } = await signIn();
    const { project, environment, snapshot } = await createSlice(api);
    const schedule = await api.runSchedule.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      name: 'On demand',
      cron: '0 0 * * *',
      environmentId: environment.id,
      testIds: [snapshot.test.id],
      enabled: false,
    });
    const jobs = await api.runSchedule.enqueue.mutate({
      meta: mutationMeta(),
      scheduleId: schedule.id,
    });
    expect(jobs).toMatchObject([
      { testId: snapshot.test.id, source: 'server-manual', status: 'queued' },
    ]);

    const queue = new ServerRunQueue(
      server.database.db,
      path.join(webappDirectory, 'artifacts'),
      undefined,
      5_000,
      {
        run: async (options) => ({
          status: 'passed',
          durationMs: 42,
          error: null,
          screenshotPath: null,
          videoPath: null,
          steps: options.steps.map((step, index) => ({
            index,
            action: step.kind,
            status: 'passed',
            durationMs: 42,
            error: null,
            pageUrl: 'https://example.test/',
          })),
        }),
      },
    );
    await queue.processNow();

    await expect(api.workspace.get.query({ meta: requestMeta() })).resolves.toMatchObject({
      serverRunJobs: [
        {
          id: jobs[0]!.id,
          status: 'passed',
          runId: expect.any(String),
          startedAt: expect.any(String),
          finishedAt: expect.any(String),
        },
      ],
      recentRuns: [
        {
          testId: snapshot.test.id,
          source: 'server-manual',
          status: 'passed',
          durationMs: 42,
          steps: [{ index: 0, status: 'passed' }],
        },
      ],
    });
  });

  it('enqueues due schedules while a test is running without overlapping executions', async () => {
    const { api } = await signIn();
    const { project, environment, snapshot } = await createSlice(api);
    const schedule = await api.runSchedule.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      name: 'Busy queue',
      cron: '0 0 1 1 *',
      environmentId: environment.id,
      testIds: [snapshot.test.id],
      enabled: false,
    });
    await api.runSchedule.enqueue.mutate({ meta: mutationMeta(), scheduleId: schedule.id });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let active = 0;
    let maxActive = 0;
    const run = vi.fn(async (_options: ServerRunOptions): Promise<ServerRunResult> => {
      active++;
      maxActive = Math.max(maxActive, active);
      if (run.mock.calls.length === 1) await gate;
      active--;
      return {
        status: 'passed',
        durationMs: 42,
        error: null,
        screenshotPath: null,
        videoPath: null,
        steps: [],
      };
    });
    const queue = new ServerRunQueue(server.database.db, artifactsDirectory, undefined, 5_000, {
      run,
    });
    try {
      await queue.start();
      await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
      await server.database.db.execute(
        sql`update run_schedules set enabled = true, next_run_at = '2000-01-01T00:00:00Z' where id = ${schedule.id}`,
      );
      // No explicit wake: the regular timer must enqueue while the first run is blocked.
      await vi.waitFor(
        async () => {
          const workspace = await api.workspace.get.query({ meta: requestMeta() });
          expect(workspace.serverRunJobs).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ source: 'server-manual', status: 'running' }),
              expect.objectContaining({ source: 'server-scheduled', status: 'queued' }),
            ]),
          );
          expect(workspace.serverRunJobs).toHaveLength(2);
        },
        { timeout: 4_000, interval: 25 },
      );
      expect(run).toHaveBeenCalledTimes(1);
      queue.wake();
      queue.wake();
      release();
      await Promise.all([queue.processNow(), queue.processNow()]);
      expect(run).toHaveBeenCalledTimes(2);
      expect(maxActive).toBe(1);
      expect((await api.workspace.get.query({ meta: requestMeta() })).serverRunJobs).toHaveLength(
        2,
      );
    } finally {
      release();
      await queue.close();
    }
  });

  it('expires only completed server artifacts after 30 days and retains run history', async () => {
    const { api, token } = await signIn();
    const { project, environment, snapshot } = await createSlice(api);
    const now = new Date('2026-09-04T12:00:00Z');
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000);
    const before = new Date(cutoff.getTime() - 1_000).toISOString();
    const after = new Date(cutoff.getTime() + 1_000).toISOString();
    const base = {
      projectId: project.id,
      testId: snapshot.test.id,
      environmentId: environment.id,
      testRevisionId: snapshot.test.currentRevision.id,
      testRevisionNumber: snapshot.test.currentRevision.number,
      source: 'server-manual',
      status: 'failed',
      startedAt: before,
      finishedAt: before,
      durationMs: 42,
      error: 'Expected failure',
      steps: [
        {
          index: 0,
          action: 'Navigate',
          status: 'failed' as const,
          durationMs: 42,
          error: 'Expected failure',
          pageUrl: null,
        },
      ],
    };
    const rows = [
      { ...base, id: randomUUID() },
      { ...base, id: randomUUID(), source: 'server-scheduled', finishedAt: cutoff.toISOString() },
      { ...base, id: randomUUID(), finishedAt: after },
      { ...base, id: randomUUID(), status: 'running', finishedAt: null },
      { ...base, id: randomUUID(), source: 'desktop-local' },
    ].map((row) => ({
      ...row,
      screenshotPath: path.join(artifactsDirectory, row.id, 'failure.png'),
      videoPath: path.join(artifactsDirectory, row.id, 'failure.webm'),
    }));
    await server.database.db.insert(testRuns).values(rows);
    for (const row of rows) {
      await mkdir(path.join(artifactsDirectory, row.id), { recursive: true });
      await writeFile(row.screenshotPath, 'png evidence');
      await writeFile(row.videoPath, 'video evidence');
    }
    const cleanup = new ServerArtifactRetention(server.database.db, artifactsDirectory);
    await cleanup.processNow(now);
    for (const [index, row] of rows.entries()) {
      const expired = index < 2;
      expect(existsSync(path.join(artifactsDirectory, row.id))).toBe(!expired);
      const [stored] = await server.database.db
        .select()
        .from(testRuns)
        .where(eq(testRuns.id, row.id));
      expect(stored).toMatchObject({
        status: row.status,
        error: row.error,
        steps: row.steps,
        screenshotPath: expired ? null : row.screenshotPath,
        videoPath: expired ? null : row.videoPath,
      });
    }
    const evidence = await fetch(`${server.url}/api/runs/${rows[0]!.id}/artifacts/screenshot`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(evidence.status).toBe(404);
    const workspace = await api.workspace.get.query({ meta: requestMeta() });
    const expiredRun = workspace.recentRuns?.find((run) => run.id === rows[0]!.id);
    expect(expiredRun).toBeDefined();
    expect(expiredRun?.artifacts?.screenshot).toBeFalsy();
    await cleanup.processNow(now);
    await cleanup.close();
  });

  it('cleans expired artifact directories in batches without following paths or symlinks outside the root', async () => {
    const { api } = await signIn();
    const { project, environment, snapshot } = await createSlice(api);
    const directory = await mkdtemp(path.join(webappDirectory, 'retention-'));
    const outside = path.join(webappDirectory, 'outside-evidence');
    await mkdir(outside);
    const outsideFile = path.join(outside, 'keep.png');
    await writeFile(outsideFile, 'Keep this file');
    const rows = Array.from({ length: 102 }, () => ({
      id: randomUUID(),
      projectId: project.id,
      testId: snapshot.test.id,
      environmentId: environment.id,
      testRevisionId: snapshot.test.currentRevision.id,
      testRevisionNumber: snapshot.test.currentRevision.number,
      source: 'server-scheduled',
      status: 'failed',
      startedAt: '2026-01-01T00:00:00Z',
      finishedAt: '2026-01-01T00:01:00Z',
      screenshotPath: outsideFile,
    }));
    await server.database.db.insert(testRuns).values(rows);
    await symlink(outside, path.join(directory, rows[0]!.id), 'dir');
    await mkdir(path.join(directory, rows[101]!.id));
    await writeFile(path.join(directory, rows[101]!.id, 'failure.png'), 'Expired');
    const cleanup = new ServerArtifactRetention(server.database.db, directory);
    await cleanup.processNow(new Date('2026-09-04T12:00:00Z'));
    expect(existsSync(outsideFile)).toBe(true);
    expect(existsSync(path.join(directory, rows[0]!.id))).toBe(false);
    expect(existsSync(path.join(directory, rows[101]!.id))).toBe(false);
    const stored = await server.database.db.select().from(testRuns);
    expect(stored).toHaveLength(102);
    expect(stored.every((run) => run.screenshotPath === null)).toBe(true);
    await cleanup.close();
  });

  it('retains artifact references on deletion failure and retries on the next sweep', async () => {
    const { api } = await signIn();
    const { project, environment, snapshot } = await createSlice(api);
    const blockedRoot = path.join(webappDirectory, 'blocked-artifact-root');
    await writeFile(blockedRoot, 'Not a directory');
    const id = randomUUID();
    const screenshotPath = path.join(blockedRoot, id, 'failure.png');
    await server.database.db.insert(testRuns).values({
      id,
      projectId: project.id,
      testId: snapshot.test.id,
      environmentId: environment.id,
      testRevisionId: snapshot.test.currentRevision.id,
      testRevisionNumber: snapshot.test.currentRevision.number,
      source: 'server-manual',
      status: 'failed',
      startedAt: '2026-01-01T00:00:00Z',
      finishedAt: '2026-01-01T00:01:00Z',
      screenshotPath,
    });
    const cleanup = new ServerArtifactRetention(server.database.db, blockedRoot);
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const now = new Date('2026-09-04T12:00:00Z');
    try {
      await cleanup.processNow(now);
      expect(errorLog).toHaveBeenCalled();
      const [failed] = await server.database.db.select().from(testRuns).where(eq(testRuns.id, id));
      expect(failed?.screenshotPath).toBe(screenshotPath);
      expect(existsSync(blockedRoot)).toBe(true);
      await rm(blockedRoot);
      await mkdir(path.join(blockedRoot, id), { recursive: true });
      await writeFile(screenshotPath, 'expired evidence');
      await cleanup.processNow(now);
      const [retried] = await server.database.db.select().from(testRuns).where(eq(testRuns.id, id));
      expect(retried?.screenshotPath).toBeNull();
      expect(existsSync(path.join(blockedRoot, id))).toBe(false);
    } finally {
      await cleanup.close();
      errorLog.mockRestore();
    }
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

  it('stores write-only secrets and validates browser authentication flow assignments', async () => {
    const { api } = await signIn();
    const project = await api.project.create.mutate({ meta: mutationMeta(), name: 'Analytics' });
    const environment = await api.environment.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      name: 'Production',
      baseUrl: 'https://analytics.example.test/',
      testIdAttribute: 'data-testid',
    });
    const setup = await api.test.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      content: {
        stepSchemaVersion: 1,
        title: 'Analytics login',
        environmentIds: [environment.id],
        prerequisites: [],
        steps: [
          {
            id: randomUUID(),
            payload: {
              version: 1,
              kind: 'navigate',
              url: 'https://analytics.example.test/login',
              metadata: { recordedAt: '2026-01-01T00:00:00.000Z' },
            },
          },
          {
            id: randomUUID(),
            payload: {
              version: 1,
              kind: 'fill',
              target: {
                primary: { strategy: 'name', value: 'password' },
                alternatives: [],
              },
              value: '',
              secret: { environmentVariable: 'E2E_PASSWORD' },
              metadata: { recordedAt: '2026-01-01T00:00:00.000Z' },
            },
          },
          {
            id: randomUUID(),
            payload: {
              version: 1,
              kind: 'assertUrlPath',
              expected: '/dashboard',
              metadata: { recordedAt: '2026-01-01T00:00:00.000Z' },
            },
          },
        ],
      },
    });
    const flow = await api.authenticationFlow.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      name: 'Analytics login',
      setupTestId: setup.test.id,
      refreshPolicy: {
        mode: 'when-stale',
        maxAgeSeconds: 43_200,
        refreshBeforeExpirySeconds: 900,
      },
    });
    const secret = await api.projectSecret.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      name: 'E2E_ANALYTICS_PASSWORD',
      value: 'never-return-this-password',
    });
    const profile = await api.profile.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      name: 'Administrator',
      authenticationType: 'browser-session',
      environments: [{ environmentId: environment.id, variables: [] }],
    });
    const otherProject = await api.project.create.mutate({
      meta: mutationMeta(),
      name: 'Other project',
    });
    const foreignSecret = await api.projectSecret.create.mutate({
      meta: mutationMeta(),
      projectId: otherProject.id,
      name: 'FOREIGN_PASSWORD',
      value: 'foreign-value',
    });
    await expect(
      api.authenticationFlow.configureProfile.mutate({
        meta: mutationMeta(),
        profileId: profile.id,
        environmentId: environment.id,
        authFlowId: flow.id,
        secretBindings: { E2E_PASSWORD: { secretId: foreignSecret.id } },
      }),
    ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
    await expect(
      api.authenticationFlow.configureProfile.mutate({
        meta: mutationMeta(),
        profileId: profile.id,
        environmentId: environment.id,
        authFlowId: flow.id,
        secretBindings: { E2E_PASSWORD: { secretId: secret.id } },
      }),
    ).resolves.toMatchObject({ revision: 1, authFlowId: flow.id });

    const workspace = await api.workspace.getWeb.query({ meta: requestMeta() });
    expect(workspace.authenticationFlows).toEqual([expect.objectContaining({ id: flow.id })]);
    expect(workspace.projectSecrets).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: secret.id, configured: true })]),
    );
    expect(JSON.stringify(workspace)).not.toContain('never-return-this-password');
    const encrypted = await server.database.pool.query<{ encryptedValue: string }>(
      'select encrypted_value as "encryptedValue" from project_secrets where id = $1',
      [secret.id],
    );
    expect(encrypted.rows[0]?.encryptedValue).not.toContain('never-return-this-password');

    await expect(
      api.test.delete.mutate({
        meta: mutationMeta(),
        testId: setup.test.id,
        baseRevision: setup.test.currentRevision,
      }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } });
  });

  it('enforces project ownership through nested test procedures', async () => {
    const owner = await signIn();
    const { snapshot } = await createSlice(owner.api);
    const stranger = await signIn('stranger@example.test', 'another correct horse password');
    await expect(
      stranger.api.test.get.query({ meta: requestMeta(), testId: snapshot.test.id }),
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
  });

  it('single-flights server refreshes, preserves state on failure, and retries once', async () => {
    const { api } = await signIn();
    const project = await api.project.create.mutate({ meta: mutationMeta(), name: 'Workers' });
    const environment = await api.environment.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      name: 'Production',
      baseUrl: 'https://workers.example.test/',
      testIdAttribute: 'data-testid',
    });
    const setup = await api.test.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      content: {
        stepSchemaVersion: 1,
        title: 'Worker login',
        environmentIds: [environment.id],
        prerequisites: [],
        steps: [
          {
            id: randomUUID(),
            payload: {
              version: 1,
              kind: 'assertUrlPath',
              expected: '/dashboard',
              metadata: { recordedAt: '2026-01-01T00:00:00.000Z' },
            },
          },
        ],
      },
    });
    const flow = await api.authenticationFlow.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      name: 'Worker login',
      setupTestId: setup.test.id,
      refreshPolicy: {
        mode: 'when-stale',
        maxAgeSeconds: 43_200,
        refreshBeforeExpirySeconds: 900,
      },
    });
    const profile = await api.profile.create.mutate({
      meta: mutationMeta(),
      projectId: project.id,
      name: 'Worker',
      authenticationType: 'browser-session',
      environments: [{ environmentId: environment.id, variables: [] }],
    });
    await api.authenticationFlow.configureProfile.mutate({
      meta: mutationMeta(),
      profileId: profile.id,
      environmentId: environment.id,
      authFlowId: flow.id,
      secretBindings: {},
    });
    const stateStore = server.authenticationStates;
    if (!stateStore) throw new Error('Authentication state encryption was not configured.');
    const scope = { projectId: project.id, environmentId: environment.id, profileId: profile.id };
    let refreshes = 0;
    const refresh = async () => {
      refreshes += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { cookies: [{ value: 'server-session' }], origins: [] };
    };
    const states = await Promise.all([
      stateStore.getOrRefresh(scope, refresh),
      stateStore.getOrRefresh(scope, refresh),
    ]);
    expect(refreshes).toBe(1);
    expect(states[0]).toEqual(states[1]);

    await server.database.pool.query(
      "update authentication_states set encrypted_state = 'damaged' where profile_id = $1",
      [profile.id],
    );
    await expect(stateStore.getOrRefresh(scope, refresh)).resolves.toEqual(states[0]);
    expect(refreshes).toBe(2);

    let attempts = 0;
    const result = await stateStore.runWithAuthenticationRetry({
      scope,
      refresh,
      execute: async (_state, attempt) => {
        attempts += 1;
        return { status: attempt === 1 ? 401 : 200 };
      },
      authenticationFailed: ({ status }) => status === 401,
    });
    expect(result.status).toBe(200);
    expect(attempts).toBe(2);
    expect(refreshes).toBe(3);

    await stateStore.invalidate(scope);
    const before = await server.database.pool.query<{ encryptedState: string }>(
      'select encrypted_state as "encryptedState" from authentication_states where profile_id = $1',
      [profile.id],
    );
    await expect(
      stateStore.getOrRefresh(scope, async () => {
        throw new Error('invalid credentials');
      }),
    ).rejects.toThrow('invalid credentials');
    const after = await server.database.pool.query<{
      encryptedState: string;
      status: string;
    }>(
      'select encrypted_state as "encryptedState", status from authentication_states where profile_id = $1',
      [profile.id],
    );
    expect(after.rows[0]).toEqual({
      encryptedState: before.rows[0]?.encryptedState,
      status: 'refresh-failed',
    });
  });
});
