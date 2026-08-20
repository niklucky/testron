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
export const testSuiteNameSchema = z.string().trim().min(1).max(100);
export const testTitleSchema = z.string().trim().min(1).max(200);
export const testIdAttributeSchema = z.string().trim().min(1).max(100);
export const workspaceViewerSchema = z
  .object({
    id: entityIdSchema,
    email: z.email(),
    name: z.string().trim().min(1).max(100).nullable(),
  })
  .strict();
export const projectMemberStatusSchema = z.enum(['active', 'blocked']);
export const invitationStatusSchema = z.enum(['invited', 'accepted', 'rejected', 'cancelled']);
export const projectMemberSchema = z
  .object({
    projectId: entityIdSchema,
    user: workspaceViewerSchema,
    role: z.enum(['owner', 'member']),
    status: projectMemberStatusSchema,
    joinedAt: timestampSchema,
  })
  .strict();
export const projectInvitationSchema = z
  .object({
    id: entityIdSchema,
    projectId: entityIdSchema,
    projectName: projectNameSchema,
    email: z.email(),
    inviteeName: z.string().trim().min(1).max(100).nullable(),
    invitedBy: workspaceViewerSchema,
    status: invitationStatusSchema,
    createdAt: timestampSchema,
    respondedAt: timestampSchema.nullable(),
  })
  .strict();
export const testRunStatusSchema = z.enum(['running', 'passed', 'failed', 'cancelled', 'timedOut']);

export const projectSchema = z
  .object({
    id: entityIdSchema,
    ownerId: entityIdSchema,
    name: projectNameSchema,
    url: httpUrlSchema.nullable(),
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

export const profileVariableSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    value: z.string().min(1).max(10_000),
    sensitive: z.boolean(),
  })
  .strict();

export const profileSchema = z
  .object({
    id: entityIdSchema,
    environmentId: entityIdSchema,
    name: z.string().trim().min(1).max(100),
    authenticationType: z.literal('credentials'),
    variables: z.array(profileVariableSchema).min(1).max(50),
    revision: revisionNumberSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    deletion: deletionStateSchema,
  })
  .strict();

export const testSuiteSchema = z
  .object({
    id: entityIdSchema,
    projectId: entityIdSchema,
    name: testSuiteNameSchema,
    revision: revisionNumberSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    deletion: deletionStateSchema,
  })
  .strict();

export const testSuiteSummarySchema = testSuiteSchema.extend({
  testCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  totalLatestDurationMs: z.number().int().nonnegative(),
  lastRunAt: timestampSchema.nullable(),
});

export const projectRunDaySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    cancelled: z.number().int().nonnegative(),
    timedOut: z.number().int().nonnegative(),
  })
  .strict();

/** Server-owned aggregates used by the dashboard overview for one project. */
export const projectOverviewSummarySchema = z
  .object({
    projectId: entityIdSchema,
    suiteCount: z.number().int().nonnegative(),
    testCount: z.number().int().nonnegative(),
    passedCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
    noResultCount: z.number().int().nonnegative(),
    runCount30d: z.number().int().nonnegative(),
    activeRunCount: z.number().int().nonnegative(),
    lastRunAt: timestampSchema.nullable(),
    runDays: z.array(projectRunDaySchema).max(30),
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
    testSuiteId: entityIdSchema.nullable(),
    title: testTitleSchema,
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
      snapshot.test.currentRevision.number !== snapshot.currentRevision.number ||
      snapshot.test.title !== snapshot.currentRevision.content.title
    )
      context.addIssue({
        code: 'custom',
        path: ['currentRevision'],
        message: 'The test projection must match the included current revision.',
      });
  });

export const testRunSchema = z
  .object({
    id: entityIdSchema,
    projectId: entityIdSchema,
    testId: entityIdSchema,
    testRevision: revisionPointerSchema,
    environmentId: entityIdSchema,
    status: testRunStatusSchema,
    source: z.literal('desktop-local'),
    startedAt: timestampSchema,
    finishedAt: timestampSchema.nullable(),
    durationMs: z.number().int().nonnegative().nullable(),
  })
  .strict();

/** The bounded project/environment/test read used to hydrate an empty desktop cache. */
export const workspaceSnapshotSchema = z
  .object({
    viewer: workspaceViewerSchema,
    members: z.array(projectMemberSchema),
    invitations: z.array(projectInvitationSchema),
    pendingInvitations: z.array(projectInvitationSchema),
    projects: z.array(projectSchema),
    environments: z.array(environmentSchema),
    profiles: z.array(profileSchema),
    testSuites: z.array(testSuiteSummarySchema),
    tests: z.array(testSnapshotSchema),
    latestTestRuns: z
      .record(
        entityIdSchema,
        z
          .object({
            status: testRunStatusSchema.exclude(['running']),
            durationMs: z.number().int().nonnegative(),
            startedAt: timestampSchema,
          })
          .strict(),
      )
      .optional(),
    projectOverviews: z.array(projectOverviewSummarySchema),
    recentRuns: z.array(testRunSchema).optional(),
    activeRuns: z.array(testRunSchema),
  })
  .strict();

export type Project = z.infer<typeof projectSchema>;
export type Environment = z.infer<typeof environmentSchema>;
export type ProfileVariable = z.infer<typeof profileVariableSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type TestSuite = z.infer<typeof testSuiteSchema>;
export type TestSuiteSummary = z.infer<typeof testSuiteSummarySchema>;
export type ProjectRunDay = z.infer<typeof projectRunDaySchema>;
export type ProjectOverviewSummary = z.infer<typeof projectOverviewSummarySchema>;
export type RevisionStep = z.infer<typeof revisionStepSchema>;
export type TestRevisionContent = z.infer<typeof testRevisionContentSchema>;
export type Test = z.infer<typeof testSchema>;
export type TestRevision = z.infer<typeof testRevisionSchema>;
export type TestSnapshot = z.infer<typeof testSnapshotSchema>;
export type TestRunStatus = z.infer<typeof testRunStatusSchema>;
export type TestRun = z.infer<typeof testRunSchema>;
export type WorkspaceViewer = z.infer<typeof workspaceViewerSchema>;
export type ProjectMemberStatus = z.infer<typeof projectMemberStatusSchema>;
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;
export type ProjectMember = z.infer<typeof projectMemberSchema>;
export type ProjectInvitation = z.infer<typeof projectInvitationSchema>;
export type WorkspaceSnapshot = z.infer<typeof workspaceSnapshotSchema>;
