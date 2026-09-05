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
export const projectActivityActionSchema = z.enum([
  'member.invited',
  'member.invitationAccepted',
  'test.created',
  'test.updated',
  'test.deleted',
  'testSuite.created',
  'testSuite.updated',
  'testSuite.deleted',
]);
export const projectActivitySchema = z
  .object({
    id: entityIdSchema,
    projectId: entityIdSchema,
    actor: workspaceViewerSchema,
    action: projectActivityActionSchema,
    entity: z
      .object({
        type: z.enum(['invitation', 'test', 'testSuite']),
        id: entityIdSchema,
        /** The label at event time remains useful after a rename or deletion. */
        label: z.string().trim().min(1).max(200),
      })
      .strict(),
    createdAt: timestampSchema,
  })
  .strict();
export const testRunStatusSchema = z.enum(['running', 'passed', 'failed', 'cancelled', 'timedOut']);
export const testRunSourceSchema = z.enum(['desktop-local', 'server-manual', 'server-scheduled']);
export const serverRunJobStatusSchema = z.enum([
  'queued',
  'running',
  'passed',
  'failed',
  'cancelled',
  'timedOut',
]);

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

export const profileAuthenticationTypeSchema = z.enum([
  'credentials',
  'cookies',
  'headers',
  'storage-state',
  'browser-session',
]);

export const browserStorageStateSchema = z
  .object({
    cookies: z
      .array(
        z
          .object({
            name: z.string().min(1),
            value: z.string(),
            domain: z.string().min(1),
            path: z.string().startsWith('/'),
            expires: z.number().finite(),
            httpOnly: z.boolean(),
            secure: z.boolean(),
            sameSite: z.enum(['Strict', 'Lax', 'None']),
            partitionKey: z.string().min(1).optional(),
          })
          .strict(),
      )
      .max(1_000),
    origins: z
      .array(
        z
          .object({
            origin: z
              .url()
              .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)),
            localStorage: z
              .array(z.object({ name: z.string(), value: z.string() }).strict())
              .max(10_000),
            indexedDB: z.array(z.unknown()).optional(),
          })
          .strict(),
      )
      .max(1_000),
  })
  .strict();

export const profileVariableSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    value: z.string().min(1).max(1_000_000),
    sensitive: z.boolean(),
  })
  .strict();

export const profileEnvironmentSchema = z
  .object({
    environmentId: entityIdSchema,
    variables: z.array(profileVariableSchema).max(50),
  })
  .strict()
  .superRefine((environment, context) => {
    const names = environment.variables.map(({ name }) => name);
    if (new Set(names).size !== names.length)
      context.addIssue({
        code: 'custom',
        path: ['variables'],
        message: 'Profile variable names must be unique.',
      });
  });

type ProfileEnvironmentKeys = {
  environmentId: string;
  variables: Array<{ name: string; sensitive: boolean }>;
};

const validateHeaderVariableNames = (
  profile: {
    authenticationType: 'credentials' | 'cookies' | 'headers' | 'storage-state' | 'browser-session';
    environments: ProfileEnvironmentKeys[];
  },
  context: z.RefinementCtx,
): void => {
  if (profile.authenticationType !== 'headers') return;
  profile.environments.forEach((environment, index) => {
    const names = environment.variables.map(({ name }) => name.toLowerCase());
    if (new Set(names).size !== names.length)
      context.addIssue({
        code: 'custom',
        path: ['environments', index, 'variables'],
        message: 'Header names must be unique regardless of case.',
      });
  });
};

const validateProfileEnvironments = (
  profile: { environments: ProfileEnvironmentKeys[] },
  context: z.RefinementCtx,
): void => {
  const environmentIds = profile.environments.map(({ environmentId }) => environmentId);
  if (new Set(environmentIds).size !== environmentIds.length)
    context.addIssue({
      code: 'custom',
      path: ['environments'],
      message: 'A profile can configure each environment only once.',
    });

  const signature = (variables: ProfileEnvironmentKeys['variables']) =>
    variables
      .map(({ name, sensitive }) => `${name}\u0000${sensitive}`)
      .sort()
      .join('\u0001');
  const expected = profile.environments[0] ? signature(profile.environments[0].variables) : '';
  profile.environments.forEach((environment, index) => {
    const names = environment.variables.map(({ name }) => name);
    if (new Set(names).size !== names.length)
      context.addIssue({
        code: 'custom',
        path: ['environments', index, 'variables'],
        message: 'Profile variable names must be unique.',
      });
    if (signature(environment.variables) !== expected)
      context.addIssue({
        code: 'custom',
        path: ['environments', index, 'variables'],
        message: 'Every environment must use the same profile variable keys.',
      });
  });
};

export const storageStateVariablesAreValid = (
  variables: Array<{ name: string; value?: string }>,
): boolean => {
  if (variables.length !== 1 || variables[0]?.name !== 'storageState') return false;
  try {
    return browserStorageStateSchema.safeParse(JSON.parse(variables[0].value ?? '')).success;
  } catch {
    return false;
  }
};

export const profileSchema = z
  .object({
    id: entityIdSchema,
    projectId: entityIdSchema,
    name: z.string().trim().min(1).max(100),
    authenticationType: profileAuthenticationTypeSchema,
    environments: z.array(profileEnvironmentSchema).min(1).max(100),
    revision: revisionNumberSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    deletion: deletionStateSchema,
  })
  .strict()
  .superRefine((profile, context) => {
    validateProfileEnvironments(profile, context);
    validateHeaderVariableNames(profile, context);
    if (
      profile.authenticationType === 'storage-state' &&
      profile.environments.some(
        (environment) => !storageStateVariablesAreValid(environment.variables),
      )
    )
      context.addIssue({
        code: 'custom',
        path: ['environments'],
        message: 'Saved browser storage state must be valid Playwright storage-state JSON.',
      });
    if (
      profile.authenticationType !== 'browser-session' &&
      profile.environments.some((environment) => environment.variables.length === 0)
    )
      context.addIssue({
        code: 'custom',
        path: ['environments'],
        message: 'This authentication type requires at least one profile variable.',
      });
  });

export const browserAuthenticationFlowSchema = z
  .object({
    id: entityIdSchema,
    projectId: entityIdSchema,
    name: z.string().trim().min(1).max(100),
    type: z.literal('browser-login'),
    setupTestId: entityIdSchema,
    revision: revisionNumberSchema,
    refreshPolicy: z
      .object({
        mode: z.enum(['when-stale', 'before-every-run']),
        maxAgeSeconds: z.number().int().min(60).max(31_536_000),
        refreshBeforeExpirySeconds: z.number().int().nonnegative().max(604_800),
      })
      .strict(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict()
  .refine(
    (flow) => flow.refreshPolicy.refreshBeforeExpirySeconds < flow.refreshPolicy.maxAgeSeconds,
    {
      path: ['refreshPolicy', 'refreshBeforeExpirySeconds'],
      message: 'Refresh lead time must be shorter than the maximum age.',
    },
  );

export const secretBindingSchema = z.object({ secretId: entityIdSchema }).strict();

export const profileEnvironmentAuthenticationSchema = z
  .object({
    profileId: entityIdSchema,
    environmentId: entityIdSchema,
    authFlowId: entityIdSchema,
    secretBindings: z.record(z.string().trim().min(1).max(100), secretBindingSchema),
    revision: revisionNumberSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const projectSecretMetadataSchema = z
  .object({
    id: entityIdSchema,
    projectId: entityIdSchema,
    name: z.string().trim().min(1).max(100),
    configured: z.boolean(),
    revision: revisionNumberSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const authenticationStateStatusSchema = z.enum([
  'not-created',
  'refreshing',
  'ready',
  'stale',
  'refresh-failed',
]);

export const authenticationStateMetadataSchema = z
  .object({
    owner: z.enum(['desktop', 'server']),
    projectId: entityIdSchema,
    environmentId: entityIdSchema,
    profileId: entityIdSchema,
    authFlowId: entityIdSchema,
    status: authenticationStateStatusSchema,
    createdAt: timestampSchema.nullable(),
    expiresAt: timestampSchema.nullable(),
    lastError: z.string().max(2_000).nullable(),
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
    /** Authentication profile used while recording and replaying this test. */
    profileId: entityIdSchema.nullable().optional(),
    environmentIds: z
      .array(entityIdSchema)
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'Test environment assignments must be unique.',
      }),
    prerequisites: z.array(z.string().trim().min(1).max(1_000)).max(100).default([]),
    /** Canonical Playwright document. Older revisions are generated from their steps on load. */
    source: z.string().max(2_000_000).optional(),
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
    profileId: entityIdSchema.nullable(),
    status: testRunStatusSchema,
    source: testRunSourceSchema,
    startedAt: timestampSchema,
    finishedAt: timestampSchema.nullable(),
    durationMs: z.number().int().nonnegative().nullable(),
    error: z.string().max(10_000).nullable(),
    artifacts: z.object({ screenshot: z.boolean(), video: z.boolean() }).strict(),
    steps: z
      .array(
        z
          .object({
            index: z.number().int().nonnegative(),
            action: z.string().min(1).max(1_000),
            status: z.enum(['passed', 'failed']),
            durationMs: z.number().int().nonnegative(),
            error: z.string().max(10_000).nullable(),
            pageUrl: z.string().max(10_000).nullable(),
          })
          .strict(),
      )
      .max(10_000),
  })
  .strict();

export const runScheduleSchema = z
  .object({
    id: entityIdSchema,
    projectId: entityIdSchema,
    name: z.string().trim().min(1).max(100),
    cron: z.string().trim().min(1).max(100),
    environmentId: entityIdSchema,
    testIds: z.array(entityIdSchema).min(1).max(500),
    enabled: z.boolean(),
    nextRunAt: timestampSchema.nullable(),
    lastEnqueuedAt: timestampSchema.nullable(),
    revision: revisionNumberSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const serverRunJobSchema = z
  .object({
    id: entityIdSchema,
    projectId: entityIdSchema,
    scheduleId: entityIdSchema.nullable(),
    testId: entityIdSchema,
    testRevision: revisionPointerSchema,
    environmentId: entityIdSchema,
    profileId: entityIdSchema.nullable(),
    source: testRunSourceSchema.exclude(['desktop-local']),
    status: serverRunJobStatusSchema,
    runId: entityIdSchema.nullable(),
    queuedAt: timestampSchema,
    startedAt: timestampSchema.nullable(),
    finishedAt: timestampSchema.nullable(),
    error: z.string().max(10_000).nullable(),
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
    authenticationFlows: z.array(browserAuthenticationFlowSchema).optional(),
    profileEnvironmentAuthentications: z.array(profileEnvironmentAuthenticationSchema).optional(),
    projectSecrets: z.array(projectSecretMetadataSchema).optional(),
    authenticationStates: z.array(authenticationStateMetadataSchema).optional(),
    testSuites: z.array(testSuiteSummarySchema),
    tests: z.array(testSnapshotSchema),
    /** Deleted records are separated so existing workspace consumers stay active-only. */
    deletedTestSuites: z.array(testSuiteSummarySchema).optional(),
    deletedTests: z.array(testSnapshotSchema).optional(),
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
    recentActivity: z.array(projectActivitySchema).max(200),
    recentRuns: z.array(testRunSchema).optional(),
    activeRuns: z.array(testRunSchema),
    runSchedules: z.array(runScheduleSchema).optional(),
    serverRunJobs: z.array(serverRunJobSchema).max(200).optional(),
  })
  .strict();

export const webProfileSchema = z
  .object({
    ...profileSchema.shape,
    environments: z
      .array(
        z
          .object({
            environmentId: entityIdSchema,
            variables: z.array(profileVariableSchema.omit({ value: true })).max(50),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine(validateProfileEnvironments);

/** Browser-safe workspace projection. Stored credential values stay server-side. */
export const webWorkspaceSnapshotSchema = workspaceSnapshotSchema
  .omit({ profiles: true })
  .extend({ profiles: z.array(webProfileSchema) })
  .strict();

export type Project = z.infer<typeof projectSchema>;
export type Environment = z.infer<typeof environmentSchema>;
export type ProfileVariable = z.infer<typeof profileVariableSchema>;
export type ProfileEnvironment = z.infer<typeof profileEnvironmentSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type BrowserAuthenticationFlow = z.infer<typeof browserAuthenticationFlowSchema>;
export type ProfileEnvironmentAuthentication = z.infer<
  typeof profileEnvironmentAuthenticationSchema
>;
export type ProjectSecretMetadata = z.infer<typeof projectSecretMetadataSchema>;
export type AuthenticationStateStatus = z.infer<typeof authenticationStateStatusSchema>;
export type AuthenticationStateMetadata = z.infer<typeof authenticationStateMetadataSchema>;
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
export type TestRunSource = z.infer<typeof testRunSourceSchema>;
export type RunSchedule = z.infer<typeof runScheduleSchema>;
export type ServerRunJobStatus = z.infer<typeof serverRunJobStatusSchema>;
export type ServerRunJob = z.infer<typeof serverRunJobSchema>;
export type WorkspaceViewer = z.infer<typeof workspaceViewerSchema>;
export type ProjectMemberStatus = z.infer<typeof projectMemberStatusSchema>;
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;
export type ProjectMember = z.infer<typeof projectMemberSchema>;
export type ProjectInvitation = z.infer<typeof projectInvitationSchema>;
export type ProjectActivityAction = z.infer<typeof projectActivityActionSchema>;
export type ProjectActivity = z.infer<typeof projectActivitySchema>;
export type WorkspaceSnapshot = z.infer<typeof workspaceSnapshotSchema>;
export type WebProfile = z.infer<typeof webProfileSchema>;
export type WebWorkspaceSnapshot = z.infer<typeof webWorkspaceSnapshotSchema>;
