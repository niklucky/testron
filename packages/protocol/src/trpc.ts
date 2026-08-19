import { z } from 'zod';

import { entityIdSchema, revisionPointerSchema, timestampSchema } from './common';
import {
  createEnvironmentRequestSchema,
  createProjectRequestSchema,
  createTestRequestSchema,
  getTestRequestSchema,
  getTestRevisionHistoryRequestSchema,
  getWorkspaceRequestSchema,
  saveTestRevisionRequestSchema,
} from './operations';
import {
  environmentSchema,
  projectSchema,
  testRevisionSchema,
  testSnapshotSchema,
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

export type AuthLoginInput = z.infer<typeof authLoginInputSchema>;
export type AuthRegisterInput = z.infer<typeof authRegisterInputSchema>;
export type AuthSessionOutput = z.infer<typeof authSessionOutputSchema>;
export type SaveTestRevisionOutput = z.infer<typeof saveTestRevisionOutputSchema>;
