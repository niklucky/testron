import { z } from 'zod';

import {
  entityIdSchema,
  httpUrlSchema,
  mutationMetadataSchema,
  requestMetadataSchema,
  responseMetadataSchema,
  revisionNumberSchema,
  revisionPointerSchema,
} from './common';
import { errorResponseSchema, revisionConflictResponseSchema } from './errors';
import {
  environmentSchema,
  environmentNameSchema,
  projectSchema,
  projectNameSchema,
  profileSchema,
  profileVariableSchema,
  testIdAttributeSchema,
  testRunSchema,
  testRunStatusSchema,
  testRevisionContentSchema,
  testRevisionSchema,
  testSnapshotSchema,
  testSuiteNameSchema,
  testSuiteSchema,
  testSuiteSummarySchema,
  workspaceSnapshotSchema,
} from './resources';

const accountNameSchema = z.string().trim().min(1).max(100);
const accountPasswordSchema = z.string().min(12).max(200);
const invitationEmailSchema = z.email().transform((email) => email.toLowerCase());

export const updateAccountProfileRequestSchema = z
  .object({ meta: mutationMetadataSchema, name: accountNameSchema })
  .strict();

export const changeAccountPasswordRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    currentPassword: accountPasswordSchema,
    newPassword: accountPasswordSchema,
  })
  .strict()
  .refine((input) => input.currentPassword !== input.newPassword, {
    message: 'The new password must be different from the current password.',
    path: ['newPassword'],
  });

export const lookupInviteeRequestSchema = z
  .object({ meta: requestMetadataSchema, email: invitationEmailSchema })
  .strict();

export const createInvitationRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    projectId: entityIdSchema,
    email: invitationEmailSchema,
  })
  .strict();

export const respondInvitationRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    invitationId: entityIdSchema,
    response: z.enum(['accepted', 'rejected']),
  })
  .strict();

export const cancelInvitationRequestSchema = z
  .object({ meta: mutationMetadataSchema, invitationId: entityIdSchema })
  .strict();

export const setMemberBlockedRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    projectId: entityIdSchema,
    userId: entityIdSchema,
    blocked: z.boolean(),
  })
  .strict();

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

export const updateProjectRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    projectId: entityIdSchema,
    baseRevision: revisionNumberSchema,
    name: projectNameSchema,
    url: httpUrlSchema.nullable(),
  })
  .strict();

export const updateEnvironmentRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    environmentId: entityIdSchema,
    baseRevision: revisionNumberSchema,
    name: environmentNameSchema,
    baseUrl: httpUrlSchema,
  })
  .strict();

const profileMutationFields = {
  name: z.string().trim().min(1).max(100),
  authenticationType: z.literal('credentials'),
  variables: z
    .array(profileVariableSchema)
    .min(1)
    .max(50)
    .refine(
      (variables) => new Set(variables.map((variable) => variable.name)).size === variables.length,
      { message: 'Profile variable names must be unique.' },
    ),
} as const;

export const createProfileRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    environmentId: entityIdSchema,
    ...profileMutationFields,
  })
  .strict();

export const updateProfileRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    profileId: entityIdSchema,
    baseRevision: revisionNumberSchema,
    ...profileMutationFields,
  })
  .strict();

export const createTestSuiteRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    projectId: entityIdSchema,
    name: testSuiteNameSchema,
  })
  .strict();

export const listTestSuitesRequestSchema = z
  .object({ meta: requestMetadataSchema, projectId: entityIdSchema })
  .strict();

export const updateTestSuiteRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    testSuiteId: entityIdSchema,
    baseRevision: revisionNumberSchema,
    name: testSuiteNameSchema,
  })
  .strict();

export const deleteTestSuiteRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    testSuiteId: entityIdSchema,
    baseRevision: revisionNumberSchema,
  })
  .strict();

export const createTestRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    projectId: entityIdSchema,
    testSuiteId: entityIdSchema.nullable().optional(),
    content: testRevisionContentSchema,
  })
  .strict();

export const getTestRequestSchema = z
  .object({ meta: requestMetadataSchema, testId: entityIdSchema })
  .strict();

export const deleteTestRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    testId: entityIdSchema,
    baseRevision: revisionPointerSchema,
  })
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

export const startTestRunRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    testId: entityIdSchema,
    environmentId: entityIdSchema,
    source: z.literal('desktop-local'),
  })
  .strict();

export const finishTestRunRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    runId: entityIdSchema,
    status: testRunStatusSchema.exclude(['running']),
    durationMs: z.number().int().nonnegative(),
    error: z.string().min(1).max(10_000).optional(),
  })
  .strict();

export const testSnapshotSuccessSchema = z
  .object({ meta: responseMetadataSchema, ok: z.literal(true), snapshot: testSnapshotSchema })
  .strict();

export const testSuiteSuccessSchema = z
  .object({ meta: responseMetadataSchema, ok: z.literal(true), testSuite: testSuiteSchema })
  .strict();

export const listTestSuitesSuccessSchema = z
  .object({
    meta: responseMetadataSchema,
    ok: z.literal(true),
    testSuites: z.array(testSuiteSummarySchema),
  })
  .strict();

export const testRunSuccessSchema = z
  .object({ meta: responseMetadataSchema, ok: z.literal(true), run: testRunSchema })
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
export const profileSuccessSchema = z
  .object({ meta: responseMetadataSchema, ok: z.literal(true), profile: profileSchema })
  .strict();
export const createProfileResultSchema = z.union([profileSuccessSchema, errorResponseSchema]);
export const updateProfileResultSchema = z.union([profileSuccessSchema, errorResponseSchema]);
export const createTestSuiteResultSchema = z.union([testSuiteSuccessSchema, errorResponseSchema]);
export const listTestSuitesResultSchema = z.union([
  listTestSuitesSuccessSchema,
  errorResponseSchema,
]);
export const updateTestSuiteResultSchema = z.union([testSuiteSuccessSchema, errorResponseSchema]);
export const deleteTestSuiteResultSchema = z.union([testSuiteSuccessSchema, errorResponseSchema]);
export const createTestResultSchema = z.union([testSnapshotSuccessSchema, errorResponseSchema]);
export const deleteTestResultSchema = z.union([testSnapshotSuccessSchema, errorResponseSchema]);
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
export const startTestRunResultSchema = z.union([testRunSuccessSchema, errorResponseSchema]);
export const finishTestRunResultSchema = z.union([testRunSuccessSchema, errorResponseSchema]);

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type UpdateAccountProfileRequest = z.infer<typeof updateAccountProfileRequestSchema>;
export type ChangeAccountPasswordRequest = z.infer<typeof changeAccountPasswordRequestSchema>;
export type LookupInviteeRequest = z.infer<typeof lookupInviteeRequestSchema>;
export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;
export type RespondInvitationRequest = z.infer<typeof respondInvitationRequestSchema>;
export type CancelInvitationRequest = z.infer<typeof cancelInvitationRequestSchema>;
export type SetMemberBlockedRequest = z.infer<typeof setMemberBlockedRequestSchema>;
export type CreateEnvironmentRequest = z.infer<typeof createEnvironmentRequestSchema>;
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;
export type UpdateEnvironmentRequest = z.infer<typeof updateEnvironmentRequestSchema>;
export type CreateProfileRequest = z.infer<typeof createProfileRequestSchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
export type CreateTestSuiteRequest = z.infer<typeof createTestSuiteRequestSchema>;
export type ListTestSuitesRequest = z.infer<typeof listTestSuitesRequestSchema>;
export type UpdateTestSuiteRequest = z.infer<typeof updateTestSuiteRequestSchema>;
export type DeleteTestSuiteRequest = z.infer<typeof deleteTestSuiteRequestSchema>;
export type CreateTestRequest = z.infer<typeof createTestRequestSchema>;
export type DeleteTestRequest = z.infer<typeof deleteTestRequestSchema>;
export type GetTestRequest = z.infer<typeof getTestRequestSchema>;
export type GetWorkspaceRequest = z.infer<typeof getWorkspaceRequestSchema>;
export type GetTestRevisionHistoryRequest = z.infer<typeof getTestRevisionHistoryRequestSchema>;
export type SaveTestRevisionRequest = z.infer<typeof saveTestRevisionRequestSchema>;
export type StartTestRunRequest = z.infer<typeof startTestRunRequestSchema>;
export type FinishTestRunRequest = z.infer<typeof finishTestRunRequestSchema>;
export type TestSnapshotSuccess = z.infer<typeof testSnapshotSuccessSchema>;
