import { createHash } from 'node:crypto';

import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';

import {
  environmentSchema,
  projectSchema,
  testSuiteSchema,
  testSuiteSummarySchema,
  testRevisionSchema,
  testSnapshotSchema,
  workspaceSnapshotSchema,
  type CreateEnvironmentRequest,
  type CreateProjectRequest,
  type CreateTestRequest,
  type CreateTestSuiteRequest,
  type DeleteTestSuiteRequest,
  type Environment,
  type GetTestRevisionHistoryRequest,
  type Project,
  type TestSuite,
  type TestSuiteSummary,
  type SaveTestRevisionOutput,
  type SaveTestRevisionRequest,
  type FinishTestRunRequest,
  type StartTestRunRequest,
  type UpdateEnvironmentRequest,
  type UpdateProjectRequest,
  type UpdateTestSuiteRequest,
  type TestRevision,
  type TestRun,
  type TestSnapshot,
  type WorkspaceSnapshot,
} from '@testron/protocol';
import type { AuthenticatedUser } from '../auth.js';
import type { Database } from './database.js';
import {
  environments,
  idempotencyRecords,
  projects,
  testRevisions,
  testRuns,
  testSuites,
  tests,
} from './schema.js';

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

  updateProject(user: AuthenticatedUser, request: UpdateProjectRequest): Promise<Project> {
    return this.idempotent(user, 'project.update', request, async (tx) => {
      await this.authorizeProject(tx, user, request.projectId);
      const [row] = await tx
        .update(projects)
        .set({
          name: request.name,
          url: request.url,
          revision: request.baseRevision + 1,
          updatedAt: new Date().toISOString(),
        })
        .where(and(eq(projects.id, request.projectId), eq(projects.revision, request.baseRevision)))
        .returning();
      if (!row) throw new RepositoryError('CONFLICT', 'The project settings changed.');
      return this.project(row);
    });
  }

  updateEnvironment(
    user: AuthenticatedUser,
    request: UpdateEnvironmentRequest,
  ): Promise<Environment> {
    return this.idempotent(user, 'environment.update', request, async (tx) => {
      const [current] = await tx
        .select()
        .from(environments)
        .where(and(eq(environments.id, request.environmentId), isNull(environments.deletedAt)))
        .limit(1);
      if (!current) throw new RepositoryError('NOT_FOUND', 'The environment was not found.');
      await this.authorizeProject(tx, user, current.projectId);
      const [row] = await tx
        .update(environments)
        .set({
          name: request.name,
          baseUrl: request.baseUrl,
          revision: request.baseRevision + 1,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(environments.id, request.environmentId),
            eq(environments.revision, request.baseRevision),
          ),
        )
        .returning();
      if (!row) throw new RepositoryError('CONFLICT', 'The environment settings changed.');
      return this.environment(row);
    });
  }

  createTestSuite(user: AuthenticatedUser, request: CreateTestSuiteRequest): Promise<TestSuite> {
    return this.idempotent(user, 'testSuite.create', request, async (tx) => {
      await this.authorizeProject(tx, user, request.projectId);
      const [row] = await tx
        .insert(testSuites)
        .values({ projectId: request.projectId, name: request.name, revision: 1 })
        .returning();
      if (!row) throw new Error('Could not create the test suite.');
      return this.testSuite(row);
    });
  }

  listTestSuites(user: AuthenticatedUser, projectId: string): Promise<TestSuiteSummary[]> {
    return this.db.transaction(async (tx) => {
      await this.authorizeProject(tx, user, projectId);
      return this.testSuiteSummaries(tx, [projectId]);
    });
  }

  updateTestSuite(user: AuthenticatedUser, request: UpdateTestSuiteRequest): Promise<TestSuite> {
    return this.idempotent(user, 'testSuite.update', request, async (tx) => {
      await this.authorizeTestSuite(tx, user, request.testSuiteId);
      const [row] = await tx
        .update(testSuites)
        .set({
          name: request.name,
          revision: request.baseRevision + 1,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(testSuites.id, request.testSuiteId),
            eq(testSuites.revision, request.baseRevision),
            isNull(testSuites.deletedAt),
          ),
        )
        .returning();
      if (!row) throw new RepositoryError('CONFLICT', 'The test suite changed.');
      return this.testSuite(row);
    });
  }

  deleteTestSuite(user: AuthenticatedUser, request: DeleteTestSuiteRequest): Promise<TestSuite> {
    return this.idempotent(user, 'testSuite.delete', request, async (tx) => {
      await this.authorizeTestSuite(tx, user, request.testSuiteId);
      const now = new Date().toISOString();
      const [row] = await tx
        .update(testSuites)
        .set({
          revision: request.baseRevision + 1,
          updatedAt: now,
          deletedAt: now,
          deletedBy: user.id,
        })
        .where(
          and(
            eq(testSuites.id, request.testSuiteId),
            eq(testSuites.revision, request.baseRevision),
            isNull(testSuites.deletedAt),
          ),
        )
        .returning();
      if (!row) throw new RepositoryError('CONFLICT', 'The test suite changed.');
      return this.testSuite(row);
    });
  }

  createTest(user: AuthenticatedUser, request: CreateTestRequest): Promise<TestSnapshot> {
    return this.idempotent(user, 'test.create', request, async (tx) => {
      await this.authorizeProject(tx, user, request.projectId);
      await this.requireEnvironment(tx, request.content.environmentId, request.projectId);
      if (request.testSuiteId)
        await this.requireTestSuite(tx, request.testSuiteId, request.projectId);
      const [test] = await tx
        .insert(tests)
        .values({
          projectId: request.projectId,
          testSuiteId: request.testSuiteId ?? null,
          createdBy: user.id,
        })
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

  startTestRun(user: AuthenticatedUser, request: StartTestRunRequest): Promise<TestRun> {
    return this.idempotent(user, 'run.start', request, async (tx) => {
      const test = await this.authorizeTest(tx, user, request.testId);
      await this.requireEnvironment(tx, request.environmentId, test.projectId);
      if (!test.currentRevisionId || !test.currentRevisionNumber)
        throw new RepositoryError('NOT_FOUND', 'The test revision was not found.');
      const [row] = await tx
        .insert(testRuns)
        .values({
          projectId: test.projectId,
          testId: test.id,
          testRevisionId: test.currentRevisionId,
          testRevisionNumber: test.currentRevisionNumber,
          environmentId: request.environmentId,
          status: 'running',
          source: request.source,
        })
        .returning();
      if (!row) throw new Error('Could not create the test run.');
      return this.run(row);
    });
  }

  finishTestRun(user: AuthenticatedUser, request: FinishTestRunRequest): Promise<TestRun> {
    return this.idempotent(user, 'run.finish', request, async (tx) => {
      const [existing] = await tx.select().from(testRuns).where(eq(testRuns.id, request.runId));
      if (!existing) throw new RepositoryError('NOT_FOUND', 'The test run was not found.');
      await this.authorizeProject(tx, user, existing.projectId);
      if (existing.status !== 'running')
        throw new RepositoryError('CONFLICT', 'The test run is already finished.');
      const [row] = await tx
        .update(testRuns)
        .set({
          status: request.status,
          durationMs: request.durationMs,
          finishedAt: new Date().toISOString(),
        })
        .where(eq(testRuns.id, request.runId))
        .returning();
      if (!row) throw new Error('Could not finish the test run.');
      return this.run(row);
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
      const projectIds = projectValues.map((project) => project.id);
      const testSuiteValues = await this.testSuiteSummaries(tx, projectIds);
      const testRows = await tx
        .select({ id: tests.id })
        .from(tests)
        .innerJoin(projects, eq(projects.id, tests.projectId))
        .where(
          and(eq(projects.ownerId, user.id), isNull(projects.deletedAt), isNull(tests.deletedAt)),
        )
        .orderBy(asc(tests.createdAt));
      const testValues = await Promise.all(testRows.map((row) => this.snapshot(tx, row.id)));
      const runRows =
        projectIds.length === 0
          ? []
          : await tx
              .select()
              .from(testRuns)
              .where(and(inArray(testRuns.projectId, projectIds), eq(testRuns.status, 'running')))
              .orderBy(asc(testRuns.startedAt));
      return workspaceSnapshotSchema.parse({
        viewer: user,
        projects: projectValues,
        environments: environmentValues,
        testSuites: testSuiteValues,
        tests: testValues,
        activeRuns: runRows.map((row) => this.run(row)),
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
  ): Promise<typeof tests.$inferSelect> {
    const [test] = await tx
      .select()
      .from(tests)
      .where(and(eq(tests.id, testId), isNull(tests.deletedAt)))
      .limit(1);
    if (!test) throw new RepositoryError('NOT_FOUND', 'The test was not found.');
    await this.authorizeProject(tx, user, test.projectId);
    return test;
  }

  private async authorizeTestSuite(
    tx: Transaction,
    user: AuthenticatedUser,
    testSuiteId: string,
  ): Promise<typeof testSuites.$inferSelect> {
    const [testSuite] = await tx
      .select()
      .from(testSuites)
      .where(and(eq(testSuites.id, testSuiteId), isNull(testSuites.deletedAt)))
      .limit(1);
    if (!testSuite) throw new RepositoryError('NOT_FOUND', 'The test suite was not found.');
    await this.authorizeProject(tx, user, testSuite.projectId);
    return testSuite;
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

  private async requireTestSuite(
    tx: Transaction,
    testSuiteId: string,
    projectId: string,
  ): Promise<void> {
    const [testSuite] = await tx
      .select({ projectId: testSuites.projectId })
      .from(testSuites)
      .where(and(eq(testSuites.id, testSuiteId), isNull(testSuites.deletedAt)))
      .limit(1);
    if (!testSuite || testSuite.projectId !== projectId)
      throw new RepositoryError('NOT_FOUND', 'The test suite was not found in this project.');
  }

  private async testSuiteSummaries(
    tx: Transaction,
    projectIds: string[],
  ): Promise<TestSuiteSummary[]> {
    if (projectIds.length === 0) return [];
    const suiteRows = await tx
      .select()
      .from(testSuites)
      .where(and(inArray(testSuites.projectId, projectIds), isNull(testSuites.deletedAt)))
      .orderBy(asc(testSuites.createdAt));
    const suiteIds = suiteRows.map((testSuite) => testSuite.id);
    if (suiteIds.length === 0) return [];
    const testRows = await tx
      .select({ id: tests.id, testSuiteId: tests.testSuiteId })
      .from(tests)
      .where(and(inArray(tests.testSuiteId, suiteIds), isNull(tests.deletedAt)));
    const testIds = testRows.map((test) => test.id);
    const runRows =
      testIds.length === 0
        ? []
        : await tx
            .select({ testId: testRuns.testId, status: testRuns.status })
            .from(testRuns)
            .where(inArray(testRuns.testId, testIds))
            .orderBy(asc(testRuns.startedAt));
    const latestStatus = new Map(runRows.map((run) => [run.testId, run.status]));
    return suiteRows.map((testSuite) => {
      const suiteTests = testRows.filter((test) => test.testSuiteId === testSuite.id);
      return testSuiteSummarySchema.parse({
        ...this.testSuite(testSuite),
        testCount: suiteTests.length,
        failedCount: suiteTests.filter((test) =>
          ['failed', 'timedOut'].includes(latestStatus.get(test.id) ?? ''),
        ).length,
      });
    });
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
        testSuiteId: test.testSuiteId,
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
      url: row.url,
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

  private testSuite(row: typeof testSuites.$inferSelect): TestSuite {
    return testSuiteSchema.parse({
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      revision: row.revision,
      createdAt: instant(row.createdAt),
      updatedAt: instant(row.updatedAt),
      deletion:
        row.deletedAt && row.deletedBy
          ? { status: 'deleted', deletedAt: instant(row.deletedAt), deletedBy: row.deletedBy }
          : activeDeletion,
    });
  }

  private run(row: typeof testRuns.$inferSelect): TestRun {
    return {
      id: row.id,
      projectId: row.projectId,
      testId: row.testId,
      testRevision: { id: row.testRevisionId, number: row.testRevisionNumber },
      environmentId: row.environmentId,
      status: row.status as TestRun['status'],
      source: 'desktop-local',
      startedAt: instant(row.startedAt),
      finishedAt: row.finishedAt ? instant(row.finishedAt) : null,
      durationMs: row.durationMs,
    };
  }
}
