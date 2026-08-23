import { randomUUID } from 'node:crypto';

import { redactStepSecrets, type Step } from '@testron/domain/steps/schema';
import {
  createEnvironmentRequestSchema,
  createProjectRequestSchema,
  createTestRequestSchema,
  saveTestRevisionRequestSchema,
  testSnapshotSchema,
  type CreateEnvironmentRequest,
  type CreateProjectRequest,
  type CreateTestRequest,
  type MutationMetadata,
  type RevisionPointer,
  type RevisionStep,
  type SaveTestRevisionRequest,
  type TestSnapshot,
} from '@testron/protocol';
import type { EnvironmentRecord, ProjectRecord, TestRecord } from '../persistence/repository';
import { desktopTestDraftSchema, type DesktopTestDraft } from './client-state';

export interface DesktopMutationIdentity {
  requestId: string;
  idempotencyKey: string;
  clientVersion: string;
}

export interface ImportedDesktopTest {
  record: TestRecord;
  steps: Step[];
  draft: DesktopTestDraft;
}

const mutationMeta = (identity: DesktopMutationIdentity): MutationMetadata => ({
  protocolVersion: 1,
  requestId: identity.requestId,
  client: { kind: 'desktop', version: identity.clientVersion },
  supportedStepVersions: [1],
  idempotencyKey: identity.idempotencyKey,
});

/** Assigns IDs once when existing Phase 2 steps first enter a synchronized draft. */
export const createRevisionSteps = (
  steps: readonly Step[],
  createId: () => string = randomUUID,
): RevisionStep[] => steps.map((step) => ({ id: createId(), payload: redactStepSecrets(step) }));

export const toCreateProjectRequest = (
  project: ProjectRecord,
  identity: DesktopMutationIdentity,
): CreateProjectRequest =>
  createProjectRequestSchema.parse({ meta: mutationMeta(identity), name: project.name });

export const toCreateEnvironmentRequest = (
  environment: EnvironmentRecord,
  identity: DesktopMutationIdentity,
): CreateEnvironmentRequest =>
  createEnvironmentRequestSchema.parse({
    meta: mutationMeta(identity),
    projectId: environment.projectId,
    name: environment.name,
    baseUrl: environment.baseUrl,
    testIdAttribute: environment.testIdAttribute,
  });

export const toCreateTestRequest = (
  test: TestRecord,
  steps: readonly Step[],
  identity: DesktopMutationIdentity,
  createStepId: () => string = randomUUID,
): CreateTestRequest =>
  createTestRequestSchema.parse({
    meta: mutationMeta(identity),
    projectId: test.projectId,
    testSuiteId: test.testSuiteId,
    content: {
      stepSchemaVersion: 1,
      title: test.title,
      environmentIds: test.environmentIds,
      prerequisites: test.prerequisites,
      steps: createRevisionSteps(steps, createStepId),
    },
  });

export const toSaveTestRevisionRequest = (
  draft: DesktopTestDraft,
  identity: DesktopMutationIdentity,
): SaveTestRevisionRequest => {
  if (!draft.testId || !draft.baseRevision)
    throw new Error('A synchronized test ID and base revision are required for revision saves.');
  return saveTestRevisionRequestSchema.parse({
    meta: mutationMeta(identity),
    testId: draft.testId,
    baseRevision: draft.baseRevision,
    content: draft.content,
  });
};

/** Converts a canonical snapshot into local records without importing server-only audit fields. */
export const fromTestSnapshot = (
  value: TestSnapshot,
  options: { draftId?: string; acknowledgedAt?: string } = {},
): ImportedDesktopTest => {
  const snapshot = testSnapshotSchema.parse(value);
  const acknowledgedAt = options.acknowledgedAt ?? new Date().toISOString();
  const draft = desktopTestDraftSchema.parse({
    draftId: options.draftId ?? randomUUID(),
    projectId: snapshot.test.projectId,
    testSuiteId: snapshot.test.testSuiteId,
    testId: snapshot.test.id,
    baseRevision: snapshot.test.currentRevision,
    content: snapshot.currentRevision.content,
    localCreatedAt: acknowledgedAt,
    localUpdatedAt: acknowledgedAt,
    syncStatus: 'synced',
  });
  return {
    record: {
      id: snapshot.test.id,
      projectId: snapshot.test.projectId,
      environmentIds: snapshot.currentRevision.content.environmentIds,
      testSuiteId: snapshot.test.testSuiteId,
      title: snapshot.test.title,
      prerequisites: snapshot.currentRevision.content.prerequisites,
      createdAt: snapshot.test.createdAt,
      updatedAt: snapshot.currentRevision.createdAt,
    },
    steps: snapshot.currentRevision.content.steps.map(({ payload }) => payload),
    draft,
  };
};

export const rebaseDraft = (
  draft: DesktopTestDraft,
  baseRevision: RevisionPointer,
  localUpdatedAt: string,
): DesktopTestDraft =>
  desktopTestDraftSchema.parse({
    ...draft,
    baseRevision,
    localUpdatedAt,
    syncStatus: 'pending',
  });
