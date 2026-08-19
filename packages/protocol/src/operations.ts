import { z } from 'zod';

import {
  entityIdSchema,
  httpUrlSchema,
  mutationMetadataSchema,
  requestMetadataSchema,
  responseMetadataSchema,
  revisionPointerSchema,
} from './common';
import { errorResponseSchema, revisionConflictResponseSchema } from './errors';
import {
  environmentSchema,
  environmentNameSchema,
  projectSchema,
  projectNameSchema,
  testIdAttributeSchema,
  testRevisionContentSchema,
  testRevisionSchema,
  testSnapshotSchema,
  workspaceSnapshotSchema,
} from './resources';

export const createProjectRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    name: projectNameSchema,
  })
  .strict();

export const createProjectSuccessSchema = z
  .object({ meta: responseMetadataSchema, ok: z.literal(true), project: projectSchema })
  .strict();

export const createEnvironmentRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    projectId: entityIdSchema,
    name: environmentNameSchema,
    baseUrl: httpUrlSchema,
    testIdAttribute: testIdAttributeSchema,
  })
  .strict();

export const createEnvironmentSuccessSchema = z
  .object({ meta: responseMetadataSchema, ok: z.literal(true), environment: environmentSchema })
  .strict();

export const createTestRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    projectId: entityIdSchema,
    content: testRevisionContentSchema,
  })
  .strict();

export const getTestRequestSchema = z
  .object({ meta: requestMetadataSchema, testId: entityIdSchema })
  .strict();

export const getWorkspaceRequestSchema = z.object({ meta: requestMetadataSchema }).strict();

export const getWorkspaceSuccessSchema = z
  .object({
    meta: responseMetadataSchema,
    ok: z.literal(true),
    workspace: workspaceSnapshotSchema,
  })
  .strict();

export const getTestRevisionHistoryRequestSchema = z
  .object({
    meta: requestMetadataSchema,
    testId: entityIdSchema,
    afterRevision: z.number().int().nonnegative().optional(),
    limit: z.number().int().min(1).max(200).default(50),
  })
  .strict();

export const saveTestRevisionRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    testId: entityIdSchema,
    baseRevision: revisionPointerSchema,
    content: testRevisionContentSchema,
  })
  .strict();

export const testSnapshotSuccessSchema = z
  .object({ meta: responseMetadataSchema, ok: z.literal(true), snapshot: testSnapshotSchema })
  .strict();

export const testRevisionHistorySuccessSchema = z
  .object({
    meta: responseMetadataSchema,
    ok: z.literal(true),
    testId: entityIdSchema,
    revisions: z.array(testRevisionSchema),
    nextAfterRevision: z.number().int().positive().nullable(),
  })
  .strict();

export const createProjectResultSchema = z.union([createProjectSuccessSchema, errorResponseSchema]);
export const createEnvironmentResultSchema = z.union([
  createEnvironmentSuccessSchema,
  errorResponseSchema,
]);
export const createTestResultSchema = z.union([testSnapshotSuccessSchema, errorResponseSchema]);
export const getTestResultSchema = z.union([testSnapshotSuccessSchema, errorResponseSchema]);
export const getWorkspaceResultSchema = z.union([getWorkspaceSuccessSchema, errorResponseSchema]);
export const saveTestRevisionResultSchema = z.union([
  testSnapshotSuccessSchema,
  revisionConflictResponseSchema,
  errorResponseSchema,
]);
export const getTestRevisionHistoryResultSchema = z.union([
  testRevisionHistorySuccessSchema,
  errorResponseSchema,
]);

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type CreateEnvironmentRequest = z.infer<typeof createEnvironmentRequestSchema>;
export type CreateTestRequest = z.infer<typeof createTestRequestSchema>;
export type GetTestRequest = z.infer<typeof getTestRequestSchema>;
export type GetWorkspaceRequest = z.infer<typeof getWorkspaceRequestSchema>;
export type GetTestRevisionHistoryRequest = z.infer<typeof getTestRevisionHistoryRequestSchema>;
export type SaveTestRevisionRequest = z.infer<typeof saveTestRevisionRequestSchema>;
export type TestSnapshotSuccess = z.infer<typeof testSnapshotSuccessSchema>;
