import { z } from 'zod';

import {
  entityIdSchema,
  idempotencyKeySchema,
  responseMetadataSchema,
  revisionPointerSchema,
} from './common';
import { testSnapshotSchema } from './resources';

const errorBase = {
  message: z.string().min(1).max(1_000),
} as const;

export const standardErrorSchema = z.discriminatedUnion('code', [
  z
    .object({
      code: z.literal('validation_failed'),
      ...errorBase,
      issues: z
        .array(
          z
            .object({
              path: z.array(z.union([z.string(), z.number().int()])),
              code: z.string().min(1).max(100),
              message: z.string().min(1).max(1_000),
            })
            .strict(),
        )
        .min(1)
        .max(100),
    })
    .strict(),
  z.object({ code: z.literal('unauthenticated'), ...errorBase }).strict(),
  z.object({ code: z.literal('forbidden'), ...errorBase }).strict(),
  z
    .object({ code: z.literal('not_found'), ...errorBase, resourceId: entityIdSchema.optional() })
    .strict(),
  z
    .object({
      code: z.literal('unsupported_protocol_version'),
      ...errorBase,
      received: z.number().int(),
      minimumSupported: z.number().int().positive(),
      maximumSupported: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      code: z.literal('unsupported_step_version'),
      ...errorBase,
      received: z.number().int(),
      supported: z.array(z.number().int().positive()).min(1),
    })
    .strict(),
  z
    .object({
      code: z.literal('idempotency_key_reused'),
      ...errorBase,
      idempotencyKey: idempotencyKeySchema,
    })
    .strict(),
  z
    .object({
      code: z.literal('idempotency_key_expired'),
      ...errorBase,
      idempotencyKey: idempotencyKeySchema,
    })
    .strict(),
]);

export const errorResponseSchema = z
  .object({
    meta: responseMetadataSchema,
    ok: z.literal(false),
    error: standardErrorSchema,
  })
  .strict();

export const revisionConflictResponseSchema = z
  .object({
    meta: responseMetadataSchema,
    ok: z.literal(false),
    error: z
      .object({
        code: z.literal('revision_conflict'),
        message: z.string().min(1).max(1_000),
        testId: entityIdSchema,
        submittedBaseRevision: revisionPointerSchema,
        current: testSnapshotSchema,
      })
      .strict(),
  })
  .strict();

export type StandardError = z.infer<typeof standardErrorSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type RevisionConflictResponse = z.infer<typeof revisionConflictResponseSchema>;
