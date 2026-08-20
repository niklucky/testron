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
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    authenticationType: text('authentication_type').notNull(),
    revision: integer('revision').notNull(),
    createdAt: instant('created_at').defaultNow().notNull(),
    updatedAt: instant('updated_at').defaultNow().notNull(),
    deletedAt: instant('deleted_at'),
    deletedBy: uuid('deleted_by').references(() => users.id),
  },
  (table) => [index('profiles_environment_idx').on(table.environmentId)],
);

export const profileVariables = pgTable(
  'profile_variables',
  {
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    value: text('value').notNull(),
    sensitive: boolean('sensitive').notNull(),
  },
  (table) => [primaryKey({ columns: [table.profileId, table.name] })],
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
    status: text('status').notNull(),
    source: text('source').notNull(),
    startedAt: instant('started_at').defaultNow().notNull(),
    finishedAt: instant('finished_at'),
    durationMs: integer('duration_ms'),
  },
  (table) => [
    index('test_runs_project_status_idx').on(table.projectId, table.status),
    index('test_runs_test_started_idx').on(table.testId, table.startedAt),
  ],
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
