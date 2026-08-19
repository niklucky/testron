import { createHash } from 'node:crypto';

import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';

import {
  environmentSchema,
  projectSchema,
  testRevisionSchema,
  testSnapshotSchema,
  workspaceSnapshotSchema,
  type CreateEnvironmentRequest,
  type CreateProjectRequest,
  type CreateTestRequest,
  type Environment,
  type GetTestRevisionHistoryRequest,
  type Project,
  type SaveTestRevisionOutput,
  type SaveTestRevisionRequest,
  type TestRevision,
  type TestSnapshot,
  type WorkspaceSnapshot,
} from '@testron/protocol';
import type { AuthenticatedUser } from '../auth.js';
import type { Database } from './database.js';
import { environments, idempotencyRecords, projects, testRevisions, tests } from './schema.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export class RepositoryError extends Error {
  constructor(
    readonly code: 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'GONE',
    message: string,
  ) {
    super(message);
  }
}

const activeDeletion = { status: 'active' } as const;
const instant = (value: string): string => new Date(value).toISOString();
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (typeof value === 'object' && value !== null)
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(',')}}`;
  return JSON.stringify(value);
};
const fingerprint = (value: unknown): string =>
  createHash('sha256').update(stable(value)).digest('hex');

export class CanonicalRepository {
  constructor(private readonly db: Database) {}

  createProject(user: AuthenticatedUser, request: CreateProjectRequest): Promise<Project> {
    return this.idempotent(user, 'project.create', request, async (tx) => {
      const [row] = await tx
        .insert(projects)
        .values({ ownerId: user.id, name: request.name, revision: 1 })
        .returning();
      if (!row) throw new Error('Could not create the project.');
      return this.project(row);
    });
  }

  createEnvironment(
    user: AuthenticatedUser,
    request: CreateEnvironmentRequest,
  ): Promise<Environment> {
    return this.idempotent(user, 'environment.create', request, async (tx) => {
      await this.authorizeProject(tx, user, request.projectId);
      const [row] = await tx
        .insert(environments)
        .values({
          projectId: request.projectId,
          name: request.name,
          baseUrl: request.baseUrl,
          testIdAttribute: request.testIdAttribute,
          revision: 1,
        })
        .returning();
      if (!row) throw new Error('Could not create the environment.');
      return this.environment(row);
    });
  }

  createTest(user: AuthenticatedUser, request: CreateTestRequest): Promise<TestSnapshot> {
    return this.idempotent(user, 'test.create', request, async (tx) => {
      await this.authorizeProject(tx, user, request.projectId);
      await this.requireEnvironment(tx, request.content.environmentId, request.projectId);
      const [test] = await tx
        .insert(tests)
        .values({ projectId: request.projectId, createdBy: user.id })
        .returning();
      if (!test) throw new Error('Could not create the test.');
      const [revision] = await tx
        .insert(testRevisions)
        .values({
          testId: test.id,
          projectId: request.projectId,
          number: 1,
          content: request.content,
          createdBy: user.id,
        })
        .returning();
      if (!revision) throw new Error('Could not create the first test revision.');
      await tx
        .update(tests)
        .set({ currentRevisionId: revision.id, currentRevisionNumber: 1 })
        .where(eq(tests.id, test.id));
      return this.snapshot(tx, test.id);
    });
  }

  getWorkspace(user: AuthenticatedUser): Promise<WorkspaceSnapshot> {
    return this.db.transaction(async (tx) => {
      const projectRows = await tx
        .select()
        .from(projects)
        .where(and(eq(projects.ownerId, user.id), isNull(projects.deletedAt)))
        .orderBy(asc(projects.createdAt));
      const projectValues = projectRows.map((row) => this.project(row));
      const environmentRows = await tx
        .select({ environment: environments })
        .from(environments)
        .innerJoin(projects, eq(projects.id, environments.projectId))
        .where(
          and(
            eq(projects.ownerId, user.id),
            isNull(projects.deletedAt),
            isNull(environments.deletedAt),
          ),
        )
        .orderBy(asc(environments.createdAt));
      const environmentValues = environmentRows.map(({ environment }) =>
        this.environment(environment),
      );
      const testRows = await tx
        .select({ id: tests.id })
        .from(tests)
        .innerJoin(projects, eq(projects.id, tests.projectId))
        .where(
          and(eq(projects.ownerId, user.id), isNull(projects.deletedAt), isNull(tests.deletedAt)),
        )
        .orderBy(asc(tests.createdAt));
      const testValues = await Promise.all(testRows.map((row) => this.snapshot(tx, row.id)));
      return workspaceSnapshotSchema.parse({
        projects: projectValues,
        environments: environmentValues,
        tests: testValues,
      });
    });
  }

  getTest(user: AuthenticatedUser, testId: string): Promise<TestSnapshot> {
    return this.db.transaction(async (tx) => {
      await this.authorizeTest(tx, user, testId);
      return this.snapshot(tx, testId);
    });
  }

  getRevisionHistory(
    user: AuthenticatedUser,
    request: GetTestRevisionHistoryRequest,
  ): Promise<{ testId: string; revisions: TestRevision[]; nextAfterRevision: number | null }> {
    return this.db.transaction(async (tx) => {
      await this.authorizeTest(tx, user, request.testId);
      const rows = await tx
        .select()
        .from(testRevisions)
        .where(
          and(
            eq(testRevisions.testId, request.testId),
            gt(testRevisions.number, request.afterRevision ?? 0),
          ),
        )
        .orderBy(asc(testRevisions.number))
        .limit(request.limit + 1);
      const hasMore = rows.length > request.limit;
      const revisions = (hasMore ? rows.slice(0, request.limit) : rows).map((row) =>
        this.revision(row),
      );
      return {
        testId: request.testId,
        revisions,
        nextAfterRevision: hasMore ? (revisions.at(-1)?.number ?? null) : null,
      };
    });
  }

  saveTestRevision(
    user: AuthenticatedUser,
    request: SaveTestRevisionRequest,
  ): Promise<SaveTestRevisionOutput> {
    return this.idempotent(user, 'test.saveRevision', request, async (tx) => {
      await this.authorizeTest(tx, user, request.testId);
      const [test] = await tx
        .select()
        .from(tests)
        .where(eq(tests.id, request.testId))
        .for('update')
        .limit(1);
      if (!test) throw new RepositoryError('NOT_FOUND', 'The test was not found.');
      await this.requireEnvironment(tx, request.content.environmentId, test.projectId);
      if (
        test.currentRevisionId !== request.baseRevision.id ||
        test.currentRevisionNumber !== request.baseRevision.number
      )
        return {
          status: 'conflict',
          testId: request.testId,
          submittedBaseRevision: request.baseRevision,
          current: await this.snapshot(tx, request.testId),
        };
      const nextNumber = request.baseRevision.number + 1;
      const [revision] = await tx
        .insert(testRevisions)
        .values({
          testId: request.testId,
          projectId: test.projectId,
          number: nextNumber,
          parentRevisionId: request.baseRevision.id,
          parentRevisionNumber: request.baseRevision.number,
          content: request.content,
          createdBy: user.id,
        })
        .returning();
      if (!revision) throw new Error('Could not create the test revision.');
      await tx
        .update(tests)
        .set({ currentRevisionId: revision.id, currentRevisionNumber: nextNumber })
        .where(eq(tests.id, request.testId));
      return { status: 'saved', snapshot: await this.snapshot(tx, request.testId) };
    });
  }

  private async idempotent<T>(
    user: AuthenticatedUser,
    operation: string,
    request: { meta: { requestId: string; idempotencyKey: string } },
    mutation: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    const semanticRequest = { ...request, meta: { ...request.meta, requestId: undefined } };
    const requestFingerprint = fingerprint(semanticRequest);
    return this.db.transaction(async (tx) => {
      const scope = `${user.id}:${operation}:${request.meta.idempotencyKey}`;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${scope}))`);
      const [existing] = await tx
        .select()
        .from(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.principalId, user.id),
            eq(idempotencyRecords.operation, operation),
            eq(idempotencyRecords.idempotencyKey, request.meta.idempotencyKey),
          ),
        )
        .limit(1);
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint)
          throw new RepositoryError(
            'CONFLICT',
            'This idempotency key was already used for a different request.',
          );
        if (Date.parse(existing.expiresAt) <= Date.now() || existing.outcome === null)
          throw new RepositoryError('GONE', 'The retained idempotency outcome has expired.');
        return existing.outcome as T;
      }
      await tx.insert(idempotencyRecords).values({
        principalId: user.id,
        operation,
        idempotencyKey: request.meta.idempotencyKey,
        requestFingerprint,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(),
      });
      const outcome = await mutation(tx);
      await tx
        .update(idempotencyRecords)
        .set({ outcome })
        .where(
          and(
            eq(idempotencyRecords.principalId, user.id),
            eq(idempotencyRecords.operation, operation),
            eq(idempotencyRecords.idempotencyKey, request.meta.idempotencyKey),
          ),
        );
      return outcome;
    });
  }

  private async authorizeProject(
    tx: Transaction,
    user: AuthenticatedUser,
    projectId: string,
  ): Promise<void> {
    const [project] = await tx
      .select({ ownerId: projects.ownerId })
      .from(projects)
      .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
      .limit(1);
    if (!project) throw new RepositoryError('NOT_FOUND', 'The project was not found.');
    if (project.ownerId !== user.id)
      throw new RepositoryError('FORBIDDEN', 'You do not have access to this project.');
  }

  private async authorizeTest(
    tx: Transaction,
    user: AuthenticatedUser,
    testId: string,
  ): Promise<void> {
    const [test] = await tx
      .select({ projectId: tests.projectId })
      .from(tests)
      .where(and(eq(tests.id, testId), isNull(tests.deletedAt)))
      .limit(1);
    if (!test) throw new RepositoryError('NOT_FOUND', 'The test was not found.');
    await this.authorizeProject(tx, user, test.projectId);
  }

  private async requireEnvironment(
    tx: Transaction,
    environmentId: string,
    projectId: string,
  ): Promise<void> {
    const [environment] = await tx
      .select({ projectId: environments.projectId })
      .from(environments)
      .where(and(eq(environments.id, environmentId), isNull(environments.deletedAt)))
      .limit(1);
    if (!environment || environment.projectId !== projectId)
      throw new RepositoryError('NOT_FOUND', 'The environment was not found in this project.');
  }

  private async snapshot(tx: Transaction, testId: string): Promise<TestSnapshot> {
    const [test] = await tx.select().from(tests).where(eq(tests.id, testId)).limit(1);
    if (!test?.currentRevisionId || !test.currentRevisionNumber)
      throw new RepositoryError('NOT_FOUND', 'The test snapshot was not found.');
    const [revision] = await tx
      .select()
      .from(testRevisions)
      .where(eq(testRevisions.id, test.currentRevisionId))
      .limit(1);
    if (!revision) throw new RepositoryError('NOT_FOUND', 'The test revision was not found.');
    return testSnapshotSchema.parse({
      test: {
        id: test.id,
        projectId: test.projectId,
        currentRevision: { id: test.currentRevisionId, number: test.currentRevisionNumber },
        createdAt: instant(test.createdAt),
        createdBy: test.createdBy,
        deletion: activeDeletion,
      },
      currentRevision: this.revision(revision),
    });
  }

  private revision(row: typeof testRevisions.$inferSelect): TestRevision {
    return testRevisionSchema.parse({
      id: row.id,
      testId: row.testId,
      projectId: row.projectId,
      number: row.number,
      parentRevision: row.parentRevisionId
        ? { id: row.parentRevisionId, number: row.parentRevisionNumber }
        : null,
      content: row.content,
      createdAt: instant(row.createdAt),
      createdBy: row.createdBy,
    });
  }

  private project(row: typeof projects.$inferSelect): Project {
    return projectSchema.parse({
      id: row.id,
      ownerId: row.ownerId,
      name: row.name,
      revision: row.revision,
      createdAt: instant(row.createdAt),
      updatedAt: instant(row.updatedAt),
      deletion: activeDeletion,
    });
  }

  private environment(row: typeof environments.$inferSelect): Environment {
    return environmentSchema.parse({
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      baseUrl: row.baseUrl,
      testIdAttribute: row.testIdAttribute,
      revision: row.revision,
      createdAt: instant(row.createdAt),
      updatedAt: instant(row.updatedAt),
      deletion: activeDeletion,
    });
  }
}
