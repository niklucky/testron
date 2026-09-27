import { z } from 'zod';
import { entityIdSchema, revisionPointerSchema } from './common';

// Source paths are portable repository-relative paths, never filesystem destinations.
export const sourcePathSchema = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (value) =>
      !value.includes('\\') &&
      !value.includes(':') &&
      ![...value].some((character) => character.charCodeAt(0) < 32) &&
      value.split('/').every((part) => part !== '' && part !== '.' && part !== '..') &&
      !value
        .split('/')
        .some(
          (part) =>
            ['.git', 'node_modules', '.env', '.testron'].includes(part) || part.startsWith('.env.'),
        ),
    'Use a repository-relative source path without traversal, credentials, or dependency directories.',
  );
export const syncProjectSchema = z.object({ projectId: entityIdSchema }).strict();
export const syncPullSchema = syncProjectSchema.extend({ repositoryId: entityIdSchema });
export const syncPushSchema = syncPullSchema
  .extend({
    dryRun: z.boolean().default(false),
    environmentIds: z.array(entityIdSchema).min(1).max(100),
    files: z
      .array(
        z
          .object({
            path: sourcePathSchema,
            source: z.string().max(2_000_000),
            baseHash: z
              .string()
              .regex(/^[a-f0-9]{64}$/)
              .nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
    tests: z
      .array(
        z
          .object({
            id: entityIdSchema,
            suiteId: entityIdSchema,
            title: z.string().trim().min(1).max(500),
            file: sourcePathSchema,
            titlePath: z.array(z.string().max(500)).max(100),
            line: z.number().int().positive(),
            baseRevision: revisionPointerSchema.nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(2_000),
  })
  .superRefine((value, ctx) => {
    for (const [key, values] of [
      ['files', value.files.map((file) => file.path)],
      ['tests', value.tests.map((test) => test.id)],
    ] as const) {
      if (new Set(values).size !== values.length)
        ctx.addIssue({ code: 'custom', path: [key], message: `Duplicate ${key}.` });
    }
    if (value.files.reduce((size, file) => size + file.source.length, 0) > 4_000_000)
      ctx.addIssue({
        code: 'custom',
        path: ['files'],
        message: 'Source bundle exceeds 4 MB of text.',
      });
    for (const test of value.tests)
      if (!value.files.some((file) => file.path === test.file))
        ctx.addIssue({
          code: 'custom',
          path: ['tests'],
          message: `Missing source for ${test.file}.`,
        });
  });
export const createSyncKeySchema = syncProjectSchema.extend({
  name: z.string().trim().min(1).max(100),
  days: z.number().int().min(1).max(365).default(90),
});
export type SyncPush = z.infer<typeof syncPushSchema>;
