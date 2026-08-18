import { z } from 'zod';

import { stepSchema } from '@testron/domain/steps/schema';
import {
  deletionStateSchema,
  entityIdSchema,
  httpUrlSchema,
  revisionNumberSchema,
  revisionPointerSchema,
  timestampSchema,
} from './common';
import { stepSchemaVersionSchema } from './version';

export const projectNameSchema = z.string().trim().min(1).max(100);
export const environmentNameSchema = z.string().trim().min(1).max(100);
export const testTitleSchema = z.string().trim().min(1).max(200);
export const testIdAttributeSchema = z.string().trim().min(1).max(100);

export const projectSchema = z
  .object({
    id: entityIdSchema,
    ownerId: entityIdSchema,
    name: projectNameSchema,
    revision: revisionNumberSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    deletion: deletionStateSchema,
  })
  .strict();

export const environmentSchema = z
  .object({
    id: entityIdSchema,
    projectId: entityIdSchema,
    name: environmentNameSchema,
    baseUrl: httpUrlSchema,
    testIdAttribute: testIdAttributeSchema,
    revision: revisionNumberSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    deletion: deletionStateSchema,
  })
  .strict();

export const revisionStepSchema = z
  .object({
    id: entityIdSchema,
    payload: stepSchema,
  })
  .strict();

export const testRevisionContentSchema = z
  .object({
    stepSchemaVersion: stepSchemaVersionSchema,
    title: testTitleSchema,
    environmentId: entityIdSchema,
    steps: z.array(revisionStepSchema).max(10_000),
  })
  .strict()
  .superRefine((content, context) => {
    const ids = new Set<string>();
    content.steps.forEach((entry, index) => {
      if (ids.has(entry.id))
        context.addIssue({
          code: 'custom',
          path: ['steps', index, 'id'],
          message: 'Step IDs must be unique within a test revision.',
        });
      ids.add(entry.id);

      if (entry.payload.kind !== 'fill') return;
      if (entry.payload.variable && entry.payload.secret)
        context.addIssue({
          code: 'custom',
          path: ['steps', index, 'payload'],
          message: 'A fill step cannot use both a profile variable and a secret variable.',
        });
      if ((entry.payload.variable || entry.payload.secret) && entry.payload.value !== '')
        context.addIssue({
          code: 'custom',
          path: ['steps', index, 'payload', 'value'],
          message: 'Resolved variable and secret values must be redacted before synchronization.',
        });
    });
  });

export const testSchema = z
  .object({
    id: entityIdSchema,
    projectId: entityIdSchema,
    currentRevision: revisionPointerSchema,
    createdAt: timestampSchema,
    createdBy: entityIdSchema,
    deletion: deletionStateSchema,
  })
  .strict();

export const testRevisionSchema = z
  .object({
    id: entityIdSchema,
    testId: entityIdSchema,
    projectId: entityIdSchema,
    number: revisionNumberSchema,
    parentRevision: revisionPointerSchema.nullable(),
    content: testRevisionContentSchema,
    createdAt: timestampSchema,
    createdBy: entityIdSchema,
  })
  .strict()
  .superRefine((revision, context) => {
    if (revision.number === 1 && revision.parentRevision !== null)
      context.addIssue({
        code: 'custom',
        path: ['parentRevision'],
        message: 'The first test revision cannot have a parent revision.',
      });
    if (revision.number > 1 && revision.parentRevision?.number !== revision.number - 1)
      context.addIssue({
        code: 'custom',
        path: ['parentRevision'],
        message: 'A test revision must point to the immediately preceding revision.',
      });
  });

export const testSnapshotSchema = z
  .object({
    test: testSchema,
    currentRevision: testRevisionSchema,
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (
      snapshot.test.id !== snapshot.currentRevision.testId ||
      snapshot.test.projectId !== snapshot.currentRevision.projectId ||
      snapshot.test.currentRevision.id !== snapshot.currentRevision.id ||
      snapshot.test.currentRevision.number !== snapshot.currentRevision.number
    )
      context.addIssue({
        code: 'custom',
        path: ['currentRevision'],
        message: 'The test current-revision pointer must match the included revision.',
      });
  });

export type Project = z.infer<typeof projectSchema>;
export type Environment = z.infer<typeof environmentSchema>;
export type RevisionStep = z.infer<typeof revisionStepSchema>;
export type TestRevisionContent = z.infer<typeof testRevisionContentSchema>;
export type Test = z.infer<typeof testSchema>;
export type TestRevision = z.infer<typeof testRevisionSchema>;
export type TestSnapshot = z.infer<typeof testSnapshotSchema>;
