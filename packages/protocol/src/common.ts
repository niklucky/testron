import { z } from 'zod';

import { protocolSchemaVersionSchema, stepSchemaVersionSchema } from './version';

export const entityIdSchema = z.uuid();
export const timestampSchema = z.iso.datetime();
export const revisionNumberSchema = z.number().int().positive();
export const ACCOUNT_PASSWORD_MIN_LENGTH = 8;
export const idempotencyKeySchema = z.string().trim().min(8).max(200);
export const httpUrlSchema = z
  .url()
  .refine((value) => URL.canParse(value) && ['http:', 'https:'].includes(new URL(value).protocol), {
    message: 'Only HTTP(S) URLs are supported.',
  });

export const revisionPointerSchema = z
  .object({
    id: entityIdSchema,
    number: revisionNumberSchema,
  })
  .strict();

export const deletionStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('active') }).strict(),
  z
    .object({
      status: z.literal('deleted'),
      deletedAt: timestampSchema,
      deletedBy: entityIdSchema,
    })
    .strict(),
]);

export const clientSchema = z
  .object({
    kind: z.enum(['desktop', 'web', 'cli']),
    version: z.string().trim().min(1).max(100),
  })
  .strict();

const requestFields = {
  protocolVersion: protocolSchemaVersionSchema,
  requestId: entityIdSchema,
  client: clientSchema,
  supportedStepVersions: z
    .array(z.number().int().positive())
    .min(1)
    .max(20)
    .refine((versions) => new Set(versions).size === versions.length, {
      message: 'Step schema versions must be unique.',
    })
    .refine((versions) => versions.includes(stepSchemaVersionSchema.value), {
      message: 'Protocol v1 test operations require structured-step schema v1 support.',
    }),
} as const;

export const requestMetadataSchema = z.object(requestFields).strict();

export const mutationMetadataSchema = z
  .object({
    ...requestFields,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const responseMetadataSchema = z
  .object({
    protocolVersion: protocolSchemaVersionSchema,
    requestId: entityIdSchema,
  })
  .strict();

export type RevisionPointer = z.infer<typeof revisionPointerSchema>;
export type DeletionState = z.infer<typeof deletionStateSchema>;
export type Client = z.infer<typeof clientSchema>;
export type RequestMetadata = z.infer<typeof requestMetadataSchema>;
export type MutationMetadata = z.infer<typeof mutationMetadataSchema>;
export type ResponseMetadata = z.infer<typeof responseMetadataSchema>;
