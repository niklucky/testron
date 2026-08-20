import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { inspectCompatibility } from '../src/compatibility';
import { revisionConflictResponseSchema } from '../src/errors';
import {
  changeAccountPasswordRequestSchema,
  createInvitationRequestSchema,
  finishTestRunRequestSchema,
  createProfileRequestSchema,
  saveTestRevisionRequestSchema,
  startTestRunRequestSchema,
  updateEnvironmentRequestSchema,
  updateProjectRequestSchema,
  updateProfileRequestSchema,
} from '../src/operations';
import { testRevisionSchema, testSnapshotSchema } from '../src/resources';

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`fixtures/${name}`, import.meta.url)), 'utf8'),
  ) as unknown;

const ids = {
  request: '00000000-0000-4000-8000-000000000101',
  actor: '00000000-0000-4000-8000-000000000102',
  project: '00000000-0000-4000-8000-000000000103',
  test: '00000000-0000-4000-8000-000000000104',
  environment: '00000000-0000-4000-8000-000000000105',
  revision: '00000000-0000-4000-8000-000000000106',
};

const revision = {
  id: ids.revision,
  testId: ids.test,
  projectId: ids.project,
  number: 1,
  parentRevision: null,
  content: {
    stepSchemaVersion: 1,
    title: 'empty test',
    environmentId: ids.environment,
    steps: [],
  },
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: ids.actor,
};

const snapshot = {
  test: {
    id: ids.test,
    projectId: ids.project,
    testSuiteId: null,
    title: 'empty test',
    currentRevision: { id: ids.revision, number: 1 },
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: ids.actor,
    deletion: { status: 'active' },
  },
  currentRevision: revision,
};

describe('protocol v1 fixtures', () => {
  it('accepts a valid revision-aware save and preserves its content', () => {
    const parsed = saveTestRevisionRequestSchema.parse(fixture('valid-save-request.json'));
    expect(parsed.baseRevision.number).toBe(7);
    expect(parsed.content.steps).toHaveLength(2);
  });

  it('rejects a synchronized secret value even when the domain step is otherwise valid', () => {
    const parsed = saveTestRevisionRequestSchema.safeParse(fixture('invalid-secret-request.json'));
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(parsed.error.issues.some((issue) => issue.path.at(-1) === 'value')).toBe(true);
  });

  it('classifies old and unsupported future protocol payloads before parsing them', () => {
    expect(inspectCompatibility(fixture('old-protocol-request.json'))).toMatchObject({
      status: 'protocol-too-old',
      received: 0,
    });
    expect(inspectCompatibility(fixture('future-protocol-request.json'))).toMatchObject({
      status: 'protocol-too-new',
      received: 2,
    });
    expect(inspectCompatibility(fixture('future-step-request.json'))).toMatchObject({
      status: 'unsupported-step-version',
      received: 2,
      supported: [1],
    });
  });
});

describe('revision invariants', () => {
  it('requires an immutable revision to point to its immediate predecessor', () => {
    expect(
      testRevisionSchema.safeParse({
        ...revision,
        id: '00000000-0000-4000-8000-000000000107',
        number: 3,
        parentRevision: { id: ids.revision, number: 1 },
      }).success,
    ).toBe(false);
  });

  it('requires the current pointer and included revision to agree', () => {
    expect(testSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(
      testSnapshotSchema.safeParse({
        ...snapshot,
        test: { ...snapshot.test, currentRevision: { id: ids.revision, number: 2 } },
      }).success,
    ).toBe(false);
    expect(
      testSnapshotSchema.safeParse({
        ...snapshot,
        test: { ...snapshot.test, title: 'stale projected title' },
      }).success,
    ).toBe(false);
  });

  it('returns the current canonical snapshot in a stale-write conflict', () => {
    const conflict = revisionConflictResponseSchema.parse({
      meta: { protocolVersion: 1, requestId: ids.request },
      ok: false,
      error: {
        code: 'revision_conflict',
        message: 'The test changed after the submitted base revision.',
        testId: ids.test,
        submittedBaseRevision: {
          id: '00000000-0000-4000-8000-000000000108',
          number: 1,
        },
        current: snapshot,
      },
    });
    expect(conflict.error.current.currentRevision.id).toBe(ids.revision);
  });
});

describe('server-owned local run lifecycle', () => {
  const meta = {
    protocolVersion: 1,
    requestId: ids.request,
    idempotencyKey: 'run-operation',
    client: { kind: 'desktop' as const, version: '0.0.1' },
    supportedStepVersions: [1],
  };

  it('validates run start and terminal completion requests', () => {
    expect(
      startTestRunRequestSchema.parse({
        meta,
        testId: ids.test,
        environmentId: ids.environment,
        source: 'desktop-local',
      }),
    ).toMatchObject({ testId: ids.test, source: 'desktop-local' });
    expect(
      finishTestRunRequestSchema.parse({
        meta,
        runId: ids.revision,
        status: 'passed',
        durationMs: 250,
      }),
    ).toMatchObject({ status: 'passed', durationMs: 250 });
    expect(
      finishTestRunRequestSchema.safeParse({
        meta,
        runId: ids.revision,
        status: 'running',
        durationMs: 0,
      }).success,
    ).toBe(false);
  });
});

describe('project settings mutations', () => {
  const meta = {
    protocolVersion: 1 as const,
    requestId: ids.request,
    idempotencyKey: 'settings-operation',
    client: { kind: 'desktop' as const, version: '0.0.1' },
    supportedStepVersions: [1],
  };

  it('validates project and environment settings with server revision guards', () => {
    expect(
      updateProjectRequestSchema.parse({
        meta,
        projectId: ids.project,
        baseRevision: 1,
        name: 'Checkout',
        url: 'https://checkout.example.test/',
      }),
    ).toMatchObject({ name: 'Checkout', baseRevision: 1 });
    expect(
      updateEnvironmentRequestSchema.parse({
        meta,
        environmentId: ids.environment,
        baseRevision: 2,
        name: 'Production',
        baseUrl: 'https://example.test/',
      }),
    ).toMatchObject({ name: 'Production', baseRevision: 2 });
    expect(
      updateProjectRequestSchema.safeParse({
        meta,
        projectId: ids.project,
        baseRevision: 0,
        name: 'Checkout',
        url: 'not a URL',
      }).success,
    ).toBe(false);
  });

  it('validates profile creation and revision-guarded updates', () => {
    const variables = [
      { name: 'username', value: 'admin@example.test', sensitive: false },
      { name: 'password', value: 'secret value', sensitive: true },
    ];
    expect(
      createProfileRequestSchema.parse({
        meta,
        environmentId: ids.environment,
        name: 'Administrator',
        authenticationType: 'credentials',
        variables,
      }),
    ).toMatchObject({ name: 'Administrator', variables });
    expect(
      updateProfileRequestSchema.parse({
        meta,
        profileId: ids.revision,
        baseRevision: 1,
        name: 'QA administrator',
        authenticationType: 'credentials',
        variables,
      }),
    ).toMatchObject({ baseRevision: 1 });
    expect(
      createProfileRequestSchema.safeParse({
        meta,
        environmentId: ids.environment,
        name: 'Duplicate variables',
        authenticationType: 'credentials',
        variables: [variables[0], variables[0]],
      }).success,
    ).toBe(false);
  });
});

describe('account and invitation mutations', () => {
  const meta = {
    protocolVersion: 1 as const,
    requestId: ids.request,
    idempotencyKey: 'account-operation',
    client: { kind: 'desktop' as const, version: '0.0.1' },
    supportedStepVersions: [1],
  };

  it('normalizes invitation email addresses and rejects password reuse', () => {
    expect(
      createInvitationRequestSchema.parse({
        meta,
        projectId: ids.project,
        email: 'Member@Example.test',
      }).email,
    ).toBe('member@example.test');
    expect(
      changeAccountPasswordRequestSchema.safeParse({
        meta,
        currentPassword: 'same password value',
        newPassword: 'same password value',
      }).success,
    ).toBe(false);
  });
});
