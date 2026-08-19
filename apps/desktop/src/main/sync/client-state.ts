import { z } from 'zod';

import {
  entityIdSchema,
  revisionPointerSchema,
  testRevisionContentSchema,
  timestampSchema,
} from '@testron/protocol';

/** Recoverable authoring state. This is deliberately not a server protocol value. */
export const desktopTestDraftSchema = z
  .object({
    draftId: entityIdSchema,
    projectId: entityIdSchema,
    testId: entityIdSchema.optional(),
    baseRevision: revisionPointerSchema.nullable(),
    content: testRevisionContentSchema,
    localCreatedAt: timestampSchema,
    localUpdatedAt: timestampSchema,
    syncStatus: z.enum(['local', 'pending', 'synced', 'conflicted']),
  })
  .strict();

/** Local execution metadata. Artifact paths and cancellation never cross the server boundary. */
export const localRunSchema = z
  .object({
    id: entityIdSchema,
    source: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('canonicalRevision'),
          testId: entityIdSchema,
          revision: revisionPointerSchema,
        })
        .strict(),
      z.object({ kind: z.literal('draft'), draftId: entityIdSchema }).strict(),
    ]),
    status: z.enum(['running', 'passed', 'failed', 'cancelled', 'timedOut']),
    startedAt: timestampSchema,
    finishedAt: timestampSchema.optional(),
    artifactPaths: z
      .object({
        screenshot: z.string().min(1).optional(),
        trace: z.string().min(1).optional(),
        authenticationState: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    error: z.string().min(1).max(10_000).optional(),
  })
  .strict();

export type DesktopTestDraft = z.infer<typeof desktopTestDraftSchema>;
export type LocalRun = z.infer<typeof localRunSchema>;
