import {
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

import type { TestRevisionContent } from '@testron/protocol';

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
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
    revision: integer('revision').notNull(),
    createdAt: instant('created_at').defaultNow().notNull(),
    updatedAt: instant('updated_at').defaultNow().notNull(),
    deletedAt: instant('deleted_at'),
    deletedBy: uuid('deleted_by').references(() => users.id),
  },
  (table) => [index('projects_owner_idx').on(table.ownerId)],
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

export const tests = pgTable(
  'tests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    currentRevisionId: uuid('current_revision_id'),
    currentRevisionNumber: integer('current_revision_number'),
    createdAt: instant('created_at').defaultNow().notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    deletedAt: instant('deleted_at'),
    deletedBy: uuid('deleted_by').references(() => users.id),
  },
  (table) => [index('tests_project_idx').on(table.projectId)],
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
