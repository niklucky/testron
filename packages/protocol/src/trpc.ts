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

export const desktopLoginStartInputSchema = z.object({ email: z.email() }).strict();
export const desktopLoginStartOutputSchema = z
  .object({
    deviceCode: z.string().min(40),
    userCode: z.string().length(8),
    verificationUri: z.url(),
    expiresInSeconds: z.number().int().positive(),
    intervalSeconds: z.number().int().positive(),
  })
  .strict();
export const desktopLoginPollInputSchema = z
  .object({ deviceCode: z.string().min(40).max(200) })
  .strict();
export const desktopLoginPollOutputSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending') }).strict(),
  z.object({ status: z.literal('expired') }).strict(),
  z
    .object({
      status: z.literal('authorized'),
      accessToken: z.string().min(40),
      expiresAt: timestampSchema,
    })
    .strict(),
]);

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

export type DesktopLoginStartOutput = z.infer<typeof desktopLoginStartOutputSchema>;
export type DesktopLoginPollOutput = z.infer<typeof desktopLoginPollOutputSchema>;
export type SaveTestRevisionOutput = z.infer<typeof saveTestRevisionOutputSchema>;
