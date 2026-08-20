import { z } from 'zod';

import { entityIdSchema, revisionPointerSchema, timestampSchema } from './common';
import {
  createEnvironmentRequestSchema,
  createProfileRequestSchema,
  createProjectRequestSchema,
  createTestRequestSchema,
  createTestSuiteRequestSchema,
  deleteTestSuiteRequestSchema,
  getTestRequestSchema,
  getTestRevisionHistoryRequestSchema,
  getWorkspaceRequestSchema,
  listTestSuitesRequestSchema,
  finishTestRunRequestSchema,
  saveTestRevisionRequestSchema,
  startTestRunRequestSchema,
  updateEnvironmentRequestSchema,
  updateProfileRequestSchema,
  updateProjectRequestSchema,
  updateTestSuiteRequestSchema,
} from './operations';
import {
  environmentSchema,
  profileSchema,
  projectSchema,
  testRevisionSchema,
  testRunSchema,
  testSnapshotSchema,
  testSuiteSchema,
  testSuiteSummarySchema,
  workspaceSnapshotSchema,
} from './resources';

const accountCredentialsFields = {
  email: z.email().transform((email) => email.toLowerCase()),
  password: z.string().min(12).max(200),
} as const;

export const authLoginInputSchema = z.object(accountCredentialsFields).strict();
export const authRegisterInputSchema = z.object(accountCredentialsFields).strict();
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
export const getWorkspaceProcedure = {
  input: getWorkspaceRequestSchema,
  output: workspaceSnapshotSchema,
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
export type AuthSessionOutput = z.infer<typeof authSessionOutputSchema>;
export type SaveTestRevisionOutput = z.infer<typeof saveTestRevisionOutputSchema>;
