import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import type { TestRevisionContent } from '@testron/protocol';

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    name: text('name'),
    passwordSalt: text('password_salt').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: instant('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: instant('expires_at').notNull(),
    createdAt: instant('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('sessions_token_hash_unique').on(table.tokenHash)],
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: instant('expires_at').notNull(),
    createdAt: instant('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('password_reset_tokens_token_hash_unique').on(table.tokenHash),
    index('password_reset_tokens_user_idx').on(table.userId),
    index('password_reset_tokens_expiry_idx').on(table.expiresAt),
  ],
);

export const passwordResetEmailOutbox = pgTable(
  'password_reset_email_outbox',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    requestedAt: instant('requested_at').defaultNow().notNull(),
    availableAt: instant('available_at').defaultNow().notNull(),
    attempts: integer('attempts').default(0).notNull(),
  },
  (table) => [index('password_reset_email_outbox_available_idx').on(table.availableAt)],
);

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    url: text('url'),
    revision: integer('revision').notNull(),
    createdAt: instant('created_at').defaultNow().notNull(),
    updatedAt: instant('updated_at').defaultNow().notNull(),
    deletedAt: instant('deleted_at'),
    deletedBy: uuid('deleted_by').references(() => users.id),
  },
  (table) => [index('projects_owner_idx').on(table.ownerId)],
);

export const projectMembers = pgTable(
  'project_members',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: instant('joined_at').defaultNow().notNull(),
    blockedAt: instant('blocked_at'),
    blockedBy: uuid('blocked_by').references(() => users.id),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    index('project_members_user_idx').on(table.userId),
  ],
);

export const projectInvitations = pgTable(
  'project_invitations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => users.id),
    status: text('status').notNull(),
    createdAt: instant('created_at').defaultNow().notNull(),
    respondedAt: instant('responded_at'),
    respondedBy: uuid('responded_by').references(() => users.id),
  },
  (table) => [
    index('project_invitations_project_idx').on(table.projectId),
    index('project_invitations_email_status_idx').on(table.email, table.status),
    uniqueIndex('project_invitations_pending_unique')
      .on(table.projectId, table.email)
      .where(sql`${table.status} = 'invited'`),
  ],
);

export const environments = pgTable(
  'environments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    baseUrl: text('base_url').notNull(),
    testIdAttribute: text('test_id_attribute').notNull(),
    revision: integer('revision').notNull(),
    createdAt: instant('created_at').defaultNow().notNull(),
    updatedAt: instant('updated_at').defaultNow().notNull(),
    deletedAt: instant('deleted_at'),
    deletedBy: uuid('deleted_by').references(() => users.id),
  },
  (table) => [index('environments_project_idx').on(table.projectId)],
);

export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    authenticationType: text('authentication_type').notNull(),
    revision: integer('revision').notNull(),
    createdAt: instant('created_at').defaultNow().notNull(),
    updatedAt: instant('updated_at').defaultNow().notNull(),
    deletedAt: instant('deleted_at'),
    deletedBy: uuid('deleted_by').references(() => users.id),
  },
  (table) => [index('profiles_project_idx').on(table.projectId)],
);

export const profileEnvironments = pgTable(
  'profile_environments',
  {
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.profileId, table.environmentId] }),
    index('profile_environments_environment_idx').on(table.environmentId),
  ],
);

export const profileVariables = pgTable(
  'profile_variables',
  {
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    value: text('value').notNull(),
    sensitive: boolean('sensitive').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.profileId, table.environmentId, table.name] }),
    index('profile_variables_environment_idx').on(table.environmentId),
  ],
);

export const testSuites = pgTable(
  'test_suites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    revision: integer('revision').notNull(),
    createdAt: instant('created_at').defaultNow().notNull(),
    updatedAt: instant('updated_at').defaultNow().notNull(),
    deletedAt: instant('deleted_at'),
    deletedBy: uuid('deleted_by').references(() => users.id),
  },
  (table) => [index('test_suites_project_idx').on(table.projectId)],
);

export const tests = pgTable(
  'tests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    testSuiteId: uuid('test_suite_id').references(() => testSuites.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    currentRevisionId: uuid('current_revision_id'),
    currentRevisionNumber: integer('current_revision_number'),
    createdAt: instant('created_at').defaultNow().notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    deletedAt: instant('deleted_at'),
    deletedBy: uuid('deleted_by').references(() => users.id),
  },
  (table) => [
    index('tests_project_idx').on(table.projectId),
    index('tests_test_suite_idx').on(table.testSuiteId),
  ],
);

export const testRevisions = pgTable(
  'test_revisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    testId: uuid('test_id')
      .notNull()
      .references(() => tests.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    parentRevisionId: uuid('parent_revision_id'),
    parentRevisionNumber: integer('parent_revision_number'),
    content: jsonb('content').$type<TestRevisionContent>().notNull(),
    createdAt: instant('created_at').defaultNow().notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    uniqueIndex('test_revisions_test_number_unique').on(table.testId, table.number),
    index('test_revisions_history_idx').on(table.testId, table.number),
  ],
);

export const browserAuthenticationFlows = pgTable(
  'browser_authentication_flows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    setupTestId: uuid('setup_test_id')
      .notNull()
      .references(() => tests.id),
    refreshMode: text('refresh_mode').notNull(),
    maxAgeSeconds: integer('max_age_seconds').notNull(),
    refreshBeforeExpirySeconds: integer('refresh_before_expiry_seconds').notNull(),
    revision: integer('revision').notNull(),
    createdAt: instant('created_at').defaultNow().notNull(),
    updatedAt: instant('updated_at').defaultNow().notNull(),
    deletedAt: instant('deleted_at'),
    deletedBy: uuid('deleted_by').references(() => users.id),
  },
  (table) => [
    index('browser_auth_flows_project_idx').on(table.projectId),
    index('browser_auth_flows_setup_test_idx').on(table.setupTestId),
  ],
);

export const projectSecrets = pgTable(
  'project_secrets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    encryptedValue: text('encrypted_value'),
    keyVersion: integer('key_version'),
    revision: integer('revision').notNull(),
    createdAt: instant('created_at').defaultNow().notNull(),
    updatedAt: instant('updated_at').defaultNow().notNull(),
    deletedAt: instant('deleted_at'),
  },
  (table) => [
    index('project_secrets_project_idx').on(table.projectId),
    uniqueIndex('project_secrets_active_name_unique')
      .on(table.projectId, table.name)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const profileEnvironmentAuthentications = pgTable(
  'profile_environment_authentications',
  {
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    authFlowId: uuid('auth_flow_id')
      .notNull()
      .references(() => browserAuthenticationFlows.id),
    secretBindings: jsonb('secret_bindings')
      .$type<Record<string, { secretId: string }>>()
      .notNull(),
    revision: integer('revision').notNull(),
    updatedAt: instant('updated_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.profileId, table.environmentId] }),
    index('profile_environment_auth_flow_idx').on(table.authFlowId),
  ],
);

export const authenticationStates = pgTable(
  'authentication_states',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    owner: text('owner').notNull(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    authFlowId: uuid('auth_flow_id')
      .notNull()
      .references(() => browserAuthenticationFlows.id, { onDelete: 'cascade' }),
    identity: jsonb('identity').$type<Record<string, unknown>>().notNull(),
    encryptedState: text('encrypted_state'),
    keyVersion: integer('key_version'),
    status: text('status').notNull(),
    createdAt: instant('created_at'),
    expiresAt: instant('expires_at'),
    lastError: text('last_error'),
    updatedAt: instant('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('authentication_states_scope_unique').on(
      table.owner,
      table.projectId,
      table.environmentId,
      table.profileId,
    ),
    index('authentication_states_expiry_idx').on(table.expiresAt),
  ],
);

export const secretAuditEvents = pgTable(
  'secret_audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    secretId: uuid('secret_id').references(() => projectSecrets.id, { onDelete: 'set null' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    createdAt: instant('created_at').defaultNow().notNull(),
  },
  (table) => [index('secret_audit_project_created_idx').on(table.projectId, table.createdAt)],
);

export const testRuns = pgTable(
  'test_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    testId: uuid('test_id')
      .notNull()
      .references(() => tests.id, { onDelete: 'cascade' }),
    testRevisionId: uuid('test_revision_id')
      .notNull()
      .references(() => testRevisions.id),
    testRevisionNumber: integer('test_revision_number').notNull(),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id),
    profileId: uuid('profile_id').references(() => profiles.id),
    status: text('status').notNull(),
    source: text('source').notNull(),
    startedAt: instant('started_at').defaultNow().notNull(),
    finishedAt: instant('finished_at'),
    durationMs: integer('duration_ms'),
    error: text('error'),
    screenshotPath: text('screenshot_path'),
    artifactsExpiredAt: instant('artifacts_expired_at'),
    videoPath: text('video_path'),
    steps: jsonb('steps')
      .$type<
        Array<{
          index: number;
          action: string;
          status: 'passed' | 'failed';
          durationMs: number;
          error: string | null;
          pageUrl: string | null;
        }>
      >()
      .default([])
      .notNull(),
  },
  (table) => [
    index('test_runs_project_status_idx').on(table.projectId, table.status),
    index('test_runs_test_started_idx').on(table.testId, table.startedAt),
  ],
);

export const runSchedules = pgTable(
  'run_schedules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    cron: text('cron').notNull(),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id),
    enabled: boolean('enabled').default(true).notNull(),
    nextRunAt: instant('next_run_at'),
    lastEnqueuedAt: instant('last_enqueued_at'),
    revision: integer('revision').notNull(),
    createdAt: instant('created_at').defaultNow().notNull(),
    updatedAt: instant('updated_at').defaultNow().notNull(),
    deletedAt: instant('deleted_at'),
    deletedBy: uuid('deleted_by').references(() => users.id),
  },
  (table) => [
    index('run_schedules_project_idx').on(table.projectId),
    index('run_schedules_due_idx').on(table.enabled, table.nextRunAt),
  ],
);

export const runScheduleTests = pgTable(
  'run_schedule_tests',
  {
    scheduleId: uuid('schedule_id')
      .notNull()
      .references(() => runSchedules.id, { onDelete: 'cascade' }),
    testId: uuid('test_id')
      .notNull()
      .references(() => tests.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.scheduleId, table.testId] }),
    index('run_schedule_tests_test_idx').on(table.testId),
  ],
);

export const serverRunJobs = pgTable(
  'server_run_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    scheduleId: uuid('schedule_id').references(() => runSchedules.id, { onDelete: 'set null' }),
    testId: uuid('test_id')
      .notNull()
      .references(() => tests.id, { onDelete: 'cascade' }),
    testRevisionId: uuid('test_revision_id')
      .notNull()
      .references(() => testRevisions.id),
    testRevisionNumber: integer('test_revision_number').notNull(),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id),
    profileId: uuid('profile_id').references(() => profiles.id),
    source: text('source').notNull(),
    status: text('status').notNull(),
    runId: uuid('run_id').references(() => testRuns.id, { onDelete: 'set null' }),
    queuedAt: instant('queued_at').defaultNow().notNull(),
    startedAt: instant('started_at'),
    finishedAt: instant('finished_at'),
    error: text('error'),
  },
  (table) => [
    index('server_run_jobs_status_queued_idx').on(table.status, table.queuedAt),
    index('server_run_jobs_project_queued_idx').on(table.projectId, table.queuedAt),
  ],
);

export const projectActivity = pgTable(
  'project_activity',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    entityLabel: text('entity_label').notNull(),
    createdAt: instant('created_at').defaultNow().notNull(),
  },
  (table) => [index('project_activity_project_created_idx').on(table.projectId, table.createdAt)],
);

export const idempotencyRecords = pgTable(
  'idempotency_records',
  {
    principalId: uuid('principal_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    operation: text('operation').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    outcome: jsonb('outcome').$type<unknown>(),
    createdAt: instant('created_at').defaultNow().notNull(),
    expiresAt: instant('expires_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.principalId, table.operation, table.idempotencyKey] })],
);
