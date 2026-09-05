import { screenshotUploadsSchema } from './attachments';
import { z } from 'zod';
import { parseCronExpression } from '@testron/domain/scheduling/cron';

import {
  ACCOUNT_PASSWORD_MIN_LENGTH,
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
  browserAuthenticationFlowSchema,
  projectSecretMetadataSchema,
  profileEnvironmentAuthenticationSchema,
  environmentNameSchema,
  projectSchema,
  projectNameSchema,
  profileSchema,
  profileAuthenticationTypeSchema,
  profileEnvironmentSchema,
  testIdAttributeSchema,
  testRunSchema,
  testRunStatusSchema,
  runScheduleSchema,
  serverRunJobSchema,
  testRevisionContentSchema,
  storageStateVariablesAreValid,
  testRevisionSchema,
  testSnapshotSchema,
  testSuiteNameSchema,
  testSuiteSchema,
  testSuiteSummarySchema,
  workspaceSnapshotSchema,
} from './resources';

const accountNameSchema = z.string().trim().min(1).max(100);
const accountPasswordSchema = z.string().min(ACCOUNT_PASSWORD_MIN_LENGTH).max(200);
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

const profileIdentityFields = {
  name: z.string().trim().min(1).max(100),
  authenticationType: profileAuthenticationTypeSchema,
} as const;

const profileVariablesSchema = profileEnvironmentSchema.shape.variables.refine(
  (variables) => new Set(variables.map((variable) => variable.name)).size === variables.length,
  { message: 'Profile variable names must be unique.' },
);

const headerVariableNamesAreUnique = (variables: Array<{ name: string }>): boolean => {
  const names = variables.map(({ name }) => name.toLowerCase());
  return new Set(names).size === names.length;
};

const profileCreateFields = {
  ...profileIdentityFields,
  environments: z
    .array(profileEnvironmentSchema)
    .min(1)
    .max(100)
    .refine(
      (environments) =>
        new Set(environments.map((environment) => environment.environmentId)).size ===
        environments.length,
      { message: 'Profile environment assignments must be unique.' },
    )
    .refine(
      (environments) => {
        const signature = (variables: (typeof environments)[number]['variables']) =>
          variables
            .map(({ name, sensitive }) => `${name}\u0000${sensitive}`)
            .sort()
            .join('\u0001');
        const expected = environments[0] ? signature(environments[0].variables) : '';
        return environments.every((environment) => signature(environment.variables) === expected);
      },
      { message: 'Every environment must use the same profile variable keys.' },
    ),
} as const;

export const createProfileRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    projectId: entityIdSchema,
    ...profileCreateFields,
  })
  .strict()
  .superRefine((request, context) => {
    request.environments.forEach((environment, index) => {
      if (
        request.authenticationType === 'headers' &&
        !headerVariableNamesAreUnique(environment.variables)
      )
        context.addIssue({
          code: 'custom',
          path: ['environments', index, 'variables'],
          message: 'Header names must be unique regardless of case.',
        });
      if (request.authenticationType !== 'browser-session' && environment.variables.length === 0)
        context.addIssue({
          code: 'custom',
          path: ['environments', index, 'variables'],
          message: 'This authentication type requires at least one profile variable.',
        });
      if (
        request.authenticationType === 'storage-state' &&
        !storageStateVariablesAreValid(environment.variables)
      )
        context.addIssue({
          code: 'custom',
          path: ['environments', index, 'variables'],
          message: 'Saved browser storage state must be valid Playwright storage-state JSON.',
        });
    });
  });

export const updateProfileRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    profileId: entityIdSchema,
    baseRevision: revisionNumberSchema,
    ...profileIdentityFields,
    environmentId: entityIdSchema,
    variables: profileVariablesSchema,
  })
  .strict()
  .superRefine((request, context) => {
    if (
      request.authenticationType === 'headers' &&
      !headerVariableNamesAreUnique(request.variables)
    )
      context.addIssue({
        code: 'custom',
        path: ['variables'],
        message: 'Header names must be unique regardless of case.',
      });
    if (request.authenticationType !== 'browser-session' && request.variables.length === 0)
      context.addIssue({
        code: 'custom',
        path: ['variables'],
        message: 'This authentication type requires at least one profile variable.',
      });
    if (
      request.authenticationType === 'storage-state' &&
      !storageStateVariablesAreValid(request.variables)
    )
      context.addIssue({
        code: 'custom',
        path: ['variables'],
        message: 'Saved browser storage state must be valid Playwright storage-state JSON.',
      });
  });

const refreshPolicySchema = browserAuthenticationFlowSchema.shape.refreshPolicy.refine(
  (policy) => policy.refreshBeforeExpirySeconds < policy.maxAgeSeconds,
  {
    path: ['refreshBeforeExpirySeconds'],
    message: 'Refresh lead time must be shorter than the maximum age.',
  },
);

export const createBrowserAuthenticationFlowRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    projectId: entityIdSchema,
    name: browserAuthenticationFlowSchema.shape.name,
    setupTestId: entityIdSchema,
    refreshPolicy: refreshPolicySchema,
  })
  .strict();

export const updateBrowserAuthenticationFlowRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    authFlowId: entityIdSchema,
    baseRevision: revisionNumberSchema,
    name: browserAuthenticationFlowSchema.shape.name,
    setupTestId: entityIdSchema,
    refreshPolicy: refreshPolicySchema,
  })
  .strict();

export const deleteBrowserAuthenticationFlowRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    authFlowId: entityIdSchema,
    baseRevision: revisionNumberSchema,
  })
  .strict();

export const configureProfileEnvironmentAuthenticationRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    profileId: entityIdSchema,
    environmentId: entityIdSchema,
    authFlowId: entityIdSchema,
    secretBindings: profileEnvironmentAuthenticationSchema.shape.secretBindings,
  })
  .strict();

const projectSecretValueSchema = z.string().min(1).max(100_000);
export const createProjectSecretRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    projectId: entityIdSchema,
    name: projectSecretMetadataSchema.shape.name,
    value: projectSecretValueSchema,
  })
  .strict();

export const replaceProjectSecretRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    secretId: entityIdSchema,
    value: projectSecretValueSchema,
  })
  .strict();

export const deleteProjectSecretRequestSchema = z
  .object({ meta: mutationMetadataSchema, secretId: entityIdSchema })
  .strict();

export const manageAuthenticationStateRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    projectId: entityIdSchema,
    environmentId: entityIdSchema,
    profileId: entityIdSchema,
    action: z.enum(['invalidate', 'clear']),
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
    screenshots: screenshotUploadsSchema.optional(),
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

export const moveTestRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    testId: entityIdSchema,
    baseRevision: revisionPointerSchema,
    projectId: entityIdSchema,
    testSuiteId: entityIdSchema,
    environmentIds: z
      .array(entityIdSchema)
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'Test environment assignments must be unique.',
      }),
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
    profileId: entityIdSchema.optional(),
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

const cronExpressionSchema = z
  .string()
  .trim()
  .min(9)
  .max(100)
  .refine((value) => value.split(/\s+/).length === 5, 'Use a five-field UTC cron expression.')
  .refine((value) => {
    try {
      parseCronExpression(value);
      return true;
    } catch {
      return false;
    }
  }, 'The UTC cron expression contains an invalid field.');

export const createRunScheduleRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    projectId: entityIdSchema,
    name: z.string().trim().min(1).max(100),
    cron: cronExpressionSchema,
    environmentId: entityIdSchema,
    testIds: z.array(entityIdSchema).min(1).max(500),
    enabled: z.boolean().default(true),
  })
  .strict();

export const updateRunScheduleRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    scheduleId: entityIdSchema,
    baseRevision: revisionNumberSchema,
    name: z.string().trim().min(1).max(100),
    cron: cronExpressionSchema,
    environmentId: entityIdSchema,
    testIds: z.array(entityIdSchema).min(1).max(500),
    enabled: z.boolean(),
  })
  .strict();

export const deleteRunScheduleRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    scheduleId: entityIdSchema,
    baseRevision: revisionNumberSchema,
  })
  .strict();

export const enqueueRunScheduleRequestSchema = z
  .object({ meta: mutationMetadataSchema, scheduleId: entityIdSchema })
  .strict();

export const runScheduleSuccessSchema = runScheduleSchema;
export const enqueueRunScheduleOutputSchema = z.array(serverRunJobSchema).min(1).max(500);

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
export const moveTestResultSchema = z.union([testSnapshotSuccessSchema, errorResponseSchema]);
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
export type CreateBrowserAuthenticationFlowRequest = z.infer<
  typeof createBrowserAuthenticationFlowRequestSchema
>;
export type UpdateBrowserAuthenticationFlowRequest = z.infer<
  typeof updateBrowserAuthenticationFlowRequestSchema
>;
export type DeleteBrowserAuthenticationFlowRequest = z.infer<
  typeof deleteBrowserAuthenticationFlowRequestSchema
>;
export type ConfigureProfileEnvironmentAuthenticationRequest = z.infer<
  typeof configureProfileEnvironmentAuthenticationRequestSchema
>;
export type CreateProjectSecretRequest = z.infer<typeof createProjectSecretRequestSchema>;
export type ReplaceProjectSecretRequest = z.infer<typeof replaceProjectSecretRequestSchema>;
export type DeleteProjectSecretRequest = z.infer<typeof deleteProjectSecretRequestSchema>;
export type ManageAuthenticationStateRequest = z.infer<
  typeof manageAuthenticationStateRequestSchema
>;
export type CreateTestSuiteRequest = z.infer<typeof createTestSuiteRequestSchema>;
export type ListTestSuitesRequest = z.infer<typeof listTestSuitesRequestSchema>;
export type UpdateTestSuiteRequest = z.infer<typeof updateTestSuiteRequestSchema>;
export type DeleteTestSuiteRequest = z.infer<typeof deleteTestSuiteRequestSchema>;
export type CreateTestRequest = z.infer<typeof createTestRequestSchema>;
export type DeleteTestRequest = z.infer<typeof deleteTestRequestSchema>;
export type MoveTestRequest = z.infer<typeof moveTestRequestSchema>;
export type GetTestRequest = z.infer<typeof getTestRequestSchema>;
export type GetWorkspaceRequest = z.infer<typeof getWorkspaceRequestSchema>;
export type GetTestRevisionHistoryRequest = z.infer<typeof getTestRevisionHistoryRequestSchema>;
export type SaveTestRevisionRequest = z.infer<typeof saveTestRevisionRequestSchema>;
export type StartTestRunRequest = z.infer<typeof startTestRunRequestSchema>;
export type FinishTestRunRequest = z.infer<typeof finishTestRunRequestSchema>;
export type CreateRunScheduleRequest = z.infer<typeof createRunScheduleRequestSchema>;
export type UpdateRunScheduleRequest = z.infer<typeof updateRunScheduleRequestSchema>;
export type DeleteRunScheduleRequest = z.infer<typeof deleteRunScheduleRequestSchema>;
export type EnqueueRunScheduleRequest = z.infer<typeof enqueueRunScheduleRequestSchema>;
export type TestSnapshotSuccess = z.infer<typeof testSnapshotSuccessSchema>;
