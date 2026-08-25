import { z } from 'zod';

import {
  ACCOUNT_PASSWORD_MIN_LENGTH,
  entityIdSchema,
  revisionPointerSchema,
  timestampSchema,
} from './common';
import {
  cancelInvitationRequestSchema,
  changeAccountPasswordRequestSchema,
  createEnvironmentRequestSchema,
  createBrowserAuthenticationFlowRequestSchema,
  updateBrowserAuthenticationFlowRequestSchema,
  deleteBrowserAuthenticationFlowRequestSchema,
  configureProfileEnvironmentAuthenticationRequestSchema,
  createProjectSecretRequestSchema,
  replaceProjectSecretRequestSchema,
  deleteProjectSecretRequestSchema,
  manageAuthenticationStateRequestSchema,
  createInvitationRequestSchema,
  createProfileRequestSchema,
  createProjectRequestSchema,
  createTestRequestSchema,
  createTestSuiteRequestSchema,
  deleteTestSuiteRequestSchema,
  deleteTestRequestSchema,
  getTestRequestSchema,
  getTestRevisionHistoryRequestSchema,
  getWorkspaceRequestSchema,
  listTestSuitesRequestSchema,
  lookupInviteeRequestSchema,
  moveTestRequestSchema,
  finishTestRunRequestSchema,
  saveTestRevisionRequestSchema,
  startTestRunRequestSchema,
  respondInvitationRequestSchema,
  setMemberBlockedRequestSchema,
  updateAccountProfileRequestSchema,
  updateEnvironmentRequestSchema,
  updateProfileRequestSchema,
  updateProjectRequestSchema,
  updateTestSuiteRequestSchema,
} from './operations';
import {
  environmentSchema,
  browserAuthenticationFlowSchema,
  projectSecretMetadataSchema,
  profileEnvironmentAuthenticationSchema,
  profileSchema,
  projectInvitationSchema,
  projectMemberSchema,
  projectSchema,
  testRevisionSchema,
  testRunSchema,
  testSnapshotSchema,
  testSuiteSchema,
  testSuiteSummarySchema,
  workspaceSnapshotSchema,
  workspaceViewerSchema,
  webWorkspaceSnapshotSchema,
} from './resources';

export const updateAccountProfileProcedure = {
  input: updateAccountProfileRequestSchema,
  output: workspaceViewerSchema,
} as const;
export const changeAccountPasswordProcedure = {
  input: changeAccountPasswordRequestSchema,
  output: z.object({ changed: z.literal(true), sessionPolicy: z.literal('preserve') }).strict(),
} as const;
export const lookupInviteeProcedure = {
  input: lookupInviteeRequestSchema,
  output: z.object({ email: z.email(), name: z.string().nullable() }).strict(),
} as const;
export const createInvitationProcedure = {
  input: createInvitationRequestSchema,
  output: projectInvitationSchema,
} as const;
export const respondInvitationProcedure = {
  input: respondInvitationRequestSchema,
  output: projectInvitationSchema,
} as const;
export const cancelInvitationProcedure = {
  input: cancelInvitationRequestSchema,
  output: projectInvitationSchema,
} as const;
export const setMemberBlockedProcedure = {
  input: setMemberBlockedRequestSchema,
  output: projectMemberSchema,
} as const;

const accountCredentialsFields = {
  email: z.email().transform((email) => email.toLowerCase()),
  password: z.string().min(ACCOUNT_PASSWORD_MIN_LENGTH).max(200),
} as const;

export const authLoginInputSchema = z.object(accountCredentialsFields).strict();
export const authRegisterInputSchema = z
  .object({
    ...accountCredentialsFields,
    name: z.string().trim().min(1).max(100),
  })
  .strict();
export const authRequestPasswordResetInputSchema = z
  .object({ email: z.email().transform((email) => email.toLowerCase()) })
  .strict();
export const authResetPasswordInputSchema = z
  .object({
    token: z.string().min(40).max(500),
    newPassword: z.string().min(ACCOUNT_PASSWORD_MIN_LENGTH).max(200),
  })
  .strict();
export const authPasswordResetRequestedOutputSchema = z
  .object({ accepted: z.literal(true) })
  .strict();
export const authPasswordResetOutputSchema = z.object({ changed: z.literal(true) }).strict();
export const authSessionOutputSchema = z
  .object({
    accessToken: z.string().min(40),
    expiresAt: timestampSchema,
  })
  .strict();

export const createProjectProcedure = {
  input: createProjectRequestSchema,
  output: projectSchema,
} as const;
export const createEnvironmentProcedure = {
  input: createEnvironmentRequestSchema,
  output: environmentSchema,
} as const;
export const updateProjectProcedure = {
  input: updateProjectRequestSchema,
  output: projectSchema,
} as const;
export const updateEnvironmentProcedure = {
  input: updateEnvironmentRequestSchema,
  output: environmentSchema,
} as const;
export const createProfileProcedure = {
  input: createProfileRequestSchema,
  output: profileSchema,
} as const;
export const updateProfileProcedure = {
  input: updateProfileRequestSchema,
  output: profileSchema,
} as const;
export const createBrowserAuthenticationFlowProcedure = {
  input: createBrowserAuthenticationFlowRequestSchema,
  output: browserAuthenticationFlowSchema,
} as const;
export const updateBrowserAuthenticationFlowProcedure = {
  input: updateBrowserAuthenticationFlowRequestSchema,
  output: browserAuthenticationFlowSchema,
} as const;
export const deleteBrowserAuthenticationFlowProcedure = {
  input: deleteBrowserAuthenticationFlowRequestSchema,
  output: browserAuthenticationFlowSchema,
} as const;
export const configureProfileEnvironmentAuthenticationProcedure = {
  input: configureProfileEnvironmentAuthenticationRequestSchema,
  output: profileEnvironmentAuthenticationSchema,
} as const;
export const createProjectSecretProcedure = {
  input: createProjectSecretRequestSchema,
  output: projectSecretMetadataSchema,
} as const;
export const replaceProjectSecretProcedure = {
  input: replaceProjectSecretRequestSchema,
  output: projectSecretMetadataSchema,
} as const;
export const deleteProjectSecretProcedure = {
  input: deleteProjectSecretRequestSchema,
  output: projectSecretMetadataSchema,
} as const;
export const manageAuthenticationStateProcedure = {
  input: manageAuthenticationStateRequestSchema,
  output: z.object({ status: z.enum(['stale', 'not-created']) }).strict(),
} as const;
export const createTestSuiteProcedure = {
  input: createTestSuiteRequestSchema,
  output: testSuiteSchema,
} as const;
export const listTestSuitesProcedure = {
  input: listTestSuitesRequestSchema,
  output: z.array(testSuiteSummarySchema),
} as const;
export const updateTestSuiteProcedure = {
  input: updateTestSuiteRequestSchema,
  output: testSuiteSchema,
} as const;
export const deleteTestSuiteProcedure = {
  input: deleteTestSuiteRequestSchema,
  output: testSuiteSchema,
} as const;
export const createTestProcedure = {
  input: createTestRequestSchema,
  output: testSnapshotSchema,
} as const;
export const deleteTestProcedure = {
  input: deleteTestRequestSchema,
  output: testSnapshotSchema,
} as const;
export const moveTestProcedure = {
  input: moveTestRequestSchema,
  output: testSnapshotSchema,
} as const;
export const getWorkspaceProcedure = {
  input: getWorkspaceRequestSchema,
  output: workspaceSnapshotSchema,
} as const;
export const getWebWorkspaceProcedure = {
  input: getWorkspaceRequestSchema,
  output: webWorkspaceSnapshotSchema,
} as const;
export const getTestProcedure = {
  input: getTestRequestSchema,
  output: testSnapshotSchema,
} as const;
export const getTestRevisionHistoryOutputSchema = z
  .object({
    testId: entityIdSchema,
    revisions: z.array(testRevisionSchema),
    nextAfterRevision: z.number().int().positive().nullable(),
  })
  .strict();
export const getTestRevisionHistoryProcedure = {
  input: getTestRevisionHistoryRequestSchema,
  output: getTestRevisionHistoryOutputSchema,
} as const;
export const saveTestRevisionOutputSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('saved'), snapshot: testSnapshotSchema }).strict(),
  z
    .object({
      status: z.literal('conflict'),
      testId: entityIdSchema,
      submittedBaseRevision: revisionPointerSchema,
      current: testSnapshotSchema,
    })
    .strict(),
]);
export const saveTestRevisionProcedure = {
  input: saveTestRevisionRequestSchema,
  output: saveTestRevisionOutputSchema,
} as const;
export const startTestRunProcedure = {
  input: startTestRunRequestSchema,
  output: testRunSchema,
} as const;
export const finishTestRunProcedure = {
  input: finishTestRunRequestSchema,
  output: testRunSchema,
} as const;

export type AuthLoginInput = z.infer<typeof authLoginInputSchema>;
export type AuthRegisterInput = z.infer<typeof authRegisterInputSchema>;
export type AuthRequestPasswordResetInput = z.infer<typeof authRequestPasswordResetInputSchema>;
export type AuthResetPasswordInput = z.infer<typeof authResetPasswordInputSchema>;
export type AuthSessionOutput = z.infer<typeof authSessionOutputSchema>;
export type SaveTestRevisionOutput = z.infer<typeof saveTestRevisionOutputSchema>;
