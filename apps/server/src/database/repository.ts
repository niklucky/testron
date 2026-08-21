import { createHash } from 'node:crypto';

import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm';

import {
  environmentSchema,
  projectInvitationSchema,
  projectMemberSchema,
  profileSchema,
  projectActivitySchema,
  projectOverviewSummarySchema,
  projectSchema,
  testSuiteSchema,
  testSuiteSummarySchema,
  testRevisionSchema,
  testSnapshotSchema,
  workspaceSnapshotSchema,
  type CreateEnvironmentRequest,
  type CreateInvitationRequest,
  type CreateProjectRequest,
  type CreateProfileRequest,
  type CreateTestRequest,
  type CreateTestSuiteRequest,
  type DeleteTestSuiteRequest,
  type DeleteTestRequest,
  type Environment,
  type ProjectInvitation,
  type ProjectActivityAction,
  type ProjectMember,
  type GetTestRevisionHistoryRequest,
  type Project,
  type Profile,
  type TestSuite,
  type TestSuiteSummary,
  type SaveTestRevisionOutput,
  type SaveTestRevisionRequest,
  type FinishTestRunRequest,
  type StartTestRunRequest,
  type UpdateEnvironmentRequest,
  type UpdateProjectRequest,
  type UpdateProfileRequest,
  type UpdateTestSuiteRequest,
  type RespondInvitationRequest,
  type CancelInvitationRequest,
  type SetMemberBlockedRequest,
  type TestRevision,
  type TestRun,
  type TestSnapshot,
  type WorkspaceSnapshot,
} from '@testron/protocol';
import type { AuthenticatedUser } from '../auth.js';
import { disabledInvitationMailer, type InvitationMailer } from '../email.js';
import type { Database } from './database.js';
import {
  environments,
  idempotencyRecords,
  projectActivity,
  projectInvitations,
  projectMembers,
  profileVariables,
  profiles,
  projects,
  testRevisions,
  testRuns,
  testSuites,
  tests,
  users,
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
  constructor(
    private readonly db: Database,
    private readonly invitationMailer: InvitationMailer = disabledInvitationMailer,
  ) {}

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

  createProfile(user: AuthenticatedUser, request: CreateProfileRequest): Promise<Profile> {
    return this.idempotent(user, 'profile.create', request, async (tx) => {
      await this.authorizeEnvironment(tx, user, request.environmentId);
      const [row] = await tx
        .insert(profiles)
        .values({
          environmentId: request.environmentId,
          name: request.name,
          authenticationType: request.authenticationType,
          revision: 1,
        })
        .returning();
      if (!row) throw new Error('Could not create the profile.');
      await tx.insert(profileVariables).values(
        request.variables.map((variable) => ({
          profileId: row.id,
          ...variable,
        })),
      );
      return this.profile(tx, row);
    });
  }

  updateProfile(user: AuthenticatedUser, request: UpdateProfileRequest): Promise<Profile> {
    return this.idempotent(user, 'profile.update', request, async (tx) => {
      await this.authorizeProfile(tx, user, request.profileId);
      const [row] = await tx
        .update(profiles)
        .set({
          name: request.name,
          authenticationType: request.authenticationType,
          revision: request.baseRevision + 1,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(profiles.id, request.profileId),
            eq(profiles.revision, request.baseRevision),
            isNull(profiles.deletedAt),
          ),
        )
        .returning();
      if (!row) throw new RepositoryError('CONFLICT', 'The profile changed.');
      await tx.delete(profileVariables).where(eq(profileVariables.profileId, request.profileId));
      await tx.insert(profileVariables).values(
        request.variables.map((variable) => ({
          profileId: request.profileId,
          ...variable,
        })),
      );
      return this.profile(tx, row);
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
      await this.recordActivity(tx, user, {
        projectId: row.projectId,
        action: 'testSuite.created',
        entityType: 'testSuite',
        entityId: row.id,
        entityLabel: row.name,
      });
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
      await this.recordActivity(tx, user, {
        projectId: row.projectId,
        action: 'testSuite.updated',
        entityType: 'testSuite',
        entityId: row.id,
        entityLabel: row.name,
      });
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
      await this.recordActivity(tx, user, {
        projectId: row.projectId,
        action: 'testSuite.deleted',
        entityType: 'testSuite',
        entityId: row.id,
        entityLabel: row.name,
      });
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
          title: request.content.title,
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
      await this.recordActivity(tx, user, {
        projectId: test.projectId,
        action: 'test.created',
        entityType: 'test',
        entityId: test.id,
        entityLabel: test.title,
      });
      return this.snapshot(tx, test.id);
    });
  }

  deleteTest(user: AuthenticatedUser, request: DeleteTestRequest): Promise<TestSnapshot> {
    return this.idempotent(user, 'test.delete', request, async (tx) => {
      const test = await this.authorizeTest(tx, user, request.testId);
      const now = new Date().toISOString();
      const [row] = await tx
        .update(tests)
        .set({ deletedAt: now, deletedBy: user.id })
        .where(
          and(
            eq(tests.id, request.testId),
            eq(tests.currentRevisionId, request.baseRevision.id),
            eq(tests.currentRevisionNumber, request.baseRevision.number),
            isNull(tests.deletedAt),
          ),
        )
        .returning();
      if (!row) throw new RepositoryError('CONFLICT', 'The test changed.');
      await this.recordActivity(tx, user, {
        projectId: row.projectId,
        action: 'test.deleted',
        entityType: 'test',
        entityId: row.id,
        entityLabel: row.title,
      });
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
          error: request.error ?? null,
          finishedAt: new Date().toISOString(),
        })
        .where(eq(testRuns.id, request.runId))
        .returning();
      if (!row) throw new Error('Could not finish the test run.');
      return this.run(row);
    });
  }

  async lookupInvitee(
    _user: AuthenticatedUser,
    email: string,
  ): Promise<{ email: string; name: string | null }> {
    const [invitee] = await this.db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return { email, name: invitee?.name ?? null };
  }

  async createInvitation(
    user: AuthenticatedUser,
    request: CreateInvitationRequest,
  ): Promise<ProjectInvitation> {
    const invitation = await this.idempotent(user, 'invitation.create', request, async (tx) => {
      await this.authorizeProject(tx, user, request.projectId);
      if (request.email === user.email)
        throw new RepositoryError('CONFLICT', 'You are already a member of this project.');

      const [projectOwner] = await tx
        .select({ email: users.email })
        .from(projects)
        .innerJoin(users, eq(users.id, projects.ownerId))
        .where(eq(projects.id, request.projectId))
        .limit(1);
      if (projectOwner?.email === request.email)
        throw new RepositoryError('CONFLICT', 'This user already owns the project.');

      const [invitee] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, request.email))
        .limit(1);
      if (invitee) {
        const [member] = await tx
          .select({ userId: projectMembers.userId })
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.projectId, request.projectId),
              eq(projectMembers.userId, invitee.id),
            ),
          )
          .limit(1);
        if (member) throw new RepositoryError('CONFLICT', 'This user is already a project member.');
      }

      const [pending] = await tx
        .select({ id: projectInvitations.id })
        .from(projectInvitations)
        .where(
          and(
            eq(projectInvitations.projectId, request.projectId),
            eq(projectInvitations.email, request.email),
            eq(projectInvitations.status, 'invited'),
          ),
        )
        .limit(1);
      if (pending) throw new RepositoryError('CONFLICT', 'An invitation is already pending.');

      const [row] = await tx
        .insert(projectInvitations)
        .values({
          projectId: request.projectId,
          email: request.email,
          invitedBy: user.id,
          status: 'invited',
        })
        .returning();
      if (!row) throw new Error('Could not create the invitation.');
      await this.recordActivity(tx, user, {
        projectId: row.projectId,
        action: 'member.invited',
        entityType: 'invitation',
        entityId: row.id,
        entityLabel: row.email,
      });
      return this.invitation(tx, row);
    });
    try {
      await this.invitationMailer.sendInvitation(invitation);
    } catch (error) {
      console.error(
        error instanceof Error ? error.message : 'Invitation email delivery failed unexpectedly.',
      );
    }
    return invitation;
  }

  respondInvitation(
    user: AuthenticatedUser,
    request: RespondInvitationRequest,
  ): Promise<ProjectInvitation> {
    return this.idempotent(user, 'invitation.respond', request, async (tx) => {
      const [invitation] = await tx
        .select()
        .from(projectInvitations)
        .where(eq(projectInvitations.id, request.invitationId))
        .limit(1);
      if (!invitation) throw new RepositoryError('NOT_FOUND', 'The invitation was not found.');
      if (invitation.email !== user.email)
        throw new RepositoryError('FORBIDDEN', 'This invitation belongs to another account.');
      if (invitation.status !== 'invited')
        throw new RepositoryError('CONFLICT', 'The invitation is no longer pending.');

      const now = new Date().toISOString();
      if (request.response === 'accepted')
        await tx
          .insert(projectMembers)
          .values({ projectId: invitation.projectId, userId: user.id, joinedAt: now })
          .onConflictDoUpdate({
            target: [projectMembers.projectId, projectMembers.userId],
            set: { blockedAt: null, blockedBy: null, joinedAt: now },
          });
      const [updated] = await tx
        .update(projectInvitations)
        .set({ status: request.response, respondedAt: now, respondedBy: user.id })
        .where(
          and(
            eq(projectInvitations.id, request.invitationId),
            eq(projectInvitations.status, 'invited'),
          ),
        )
        .returning();
      if (!updated) throw new RepositoryError('CONFLICT', 'The invitation changed.');
      if (request.response === 'accepted')
        await this.recordActivity(tx, user, {
          projectId: updated.projectId,
          action: 'member.invitationAccepted',
          entityType: 'invitation',
          entityId: updated.id,
          entityLabel: updated.email,
        });
      return this.invitation(tx, updated);
    });
  }

  cancelInvitation(
    user: AuthenticatedUser,
    request: CancelInvitationRequest,
  ): Promise<ProjectInvitation> {
    return this.idempotent(user, 'invitation.cancel', request, async (tx) => {
      const [invitation] = await tx
        .select()
        .from(projectInvitations)
        .where(eq(projectInvitations.id, request.invitationId))
        .limit(1);
      if (!invitation) throw new RepositoryError('NOT_FOUND', 'The invitation was not found.');
      const owner = await this.isProjectOwner(tx, user, invitation.projectId);
      if (!owner && invitation.invitedBy !== user.id)
        throw new RepositoryError('FORBIDDEN', 'Only the inviter or project owner may cancel.');
      if (invitation.status !== 'invited')
        throw new RepositoryError('CONFLICT', 'The invitation is no longer pending.');
      const [updated] = await tx
        .update(projectInvitations)
        .set({
          status: 'cancelled',
          respondedAt: new Date().toISOString(),
          respondedBy: user.id,
        })
        .where(
          and(
            eq(projectInvitations.id, request.invitationId),
            eq(projectInvitations.status, 'invited'),
          ),
        )
        .returning();
      if (!updated) throw new RepositoryError('CONFLICT', 'The invitation changed.');
      return this.invitation(tx, updated);
    });
  }

  setMemberBlocked(
    user: AuthenticatedUser,
    request: SetMemberBlockedRequest,
  ): Promise<ProjectMember> {
    return this.idempotent(user, 'member.setBlocked', request, async (tx) => {
      await this.authorizeProjectOwner(tx, user, request.projectId);
      const [updated] = await tx
        .update(projectMembers)
        .set({
          blockedAt: request.blocked ? new Date().toISOString() : null,
          blockedBy: request.blocked ? user.id : null,
        })
        .where(
          and(
            eq(projectMembers.projectId, request.projectId),
            eq(projectMembers.userId, request.userId),
          ),
        )
        .returning();
      if (!updated) throw new RepositoryError('NOT_FOUND', 'The project member was not found.');
      return this.member(tx, updated);
    });
  }

  getWorkspace(user: AuthenticatedUser): Promise<WorkspaceSnapshot> {
    return this.db.transaction(async (tx) => {
      const ownedProjectRows = await tx
        .select()
        .from(projects)
        .where(and(eq(projects.ownerId, user.id), isNull(projects.deletedAt)))
        .orderBy(asc(projects.createdAt));
      const memberProjectRows = await tx
        .select({ project: projects })
        .from(projectMembers)
        .innerJoin(projects, eq(projects.id, projectMembers.projectId))
        .where(
          and(
            eq(projectMembers.userId, user.id),
            isNull(projectMembers.blockedAt),
            isNull(projects.deletedAt),
          ),
        )
        .orderBy(asc(projects.createdAt));
      const projectRows = [
        ...new Map(
          [...ownedProjectRows, ...memberProjectRows.map(({ project }) => project)].map(
            (project) => [project.id, project],
          ),
        ).values(),
      ];
      const projectValues = projectRows.map((row) => this.project(row));
      const projectIds = projectValues.map((project) => project.id);
      const environmentRows =
        projectIds.length === 0
          ? []
          : await tx
              .select()
              .from(environments)
              .where(
                and(inArray(environments.projectId, projectIds), isNull(environments.deletedAt)),
              )
              .orderBy(asc(environments.createdAt));
      const environmentValues = environmentRows.map((environment) => this.environment(environment));
      const environmentIds = environmentValues.map((environment) => environment.id);
      const profileRows =
        environmentIds.length === 0
          ? []
          : await tx
              .select()
              .from(profiles)
              .where(
                and(inArray(profiles.environmentId, environmentIds), isNull(profiles.deletedAt)),
              )
              .orderBy(asc(profiles.createdAt));
      const profileValues = await Promise.all(profileRows.map((row) => this.profile(tx, row)));
      const testSuiteValues = await this.testSuiteSummaries(tx, projectIds);
      const deletedTestSuiteValues = await this.testSuiteSummaries(tx, projectIds, 'deleted');
      const testRows =
        projectIds.length === 0
          ? []
          : await tx
              .select({ id: tests.id })
              .from(tests)
              .where(and(inArray(tests.projectId, projectIds), isNull(tests.deletedAt)))
              .orderBy(asc(tests.createdAt));
      const testValues = await Promise.all(testRows.map((row) => this.snapshot(tx, row.id)));
      const deletedTestRows =
        projectIds.length === 0
          ? []
          : await tx
              .select({ id: tests.id })
              .from(tests)
              .where(and(inArray(tests.projectId, projectIds), isNotNull(tests.deletedAt)))
              .orderBy(asc(tests.createdAt));
      const deletedTestValues = await Promise.all(
        deletedTestRows.map((row) => this.snapshot(tx, row.id)),
      );
      const testIds = testRows.map((test) => test.id);
      const completedRunRows =
        testIds.length === 0
          ? []
          : await tx
              .select({
                projectId: testRuns.projectId,
                testId: testRuns.testId,
                status: testRuns.status,
                durationMs: testRuns.durationMs,
                startedAt: testRuns.startedAt,
              })
              .from(testRuns)
              .where(and(inArray(testRuns.testId, testIds), isNotNull(testRuns.durationMs)))
              .orderBy(asc(testRuns.startedAt));
      const latestTestRuns: Record<
        string,
        {
          status: 'passed' | 'failed' | 'cancelled' | 'timedOut';
          durationMs: number;
          startedAt: string;
        }
      > = {};
      for (const run of completedRunRows)
        if (
          run.durationMs !== null &&
          ['passed', 'failed', 'cancelled', 'timedOut'].includes(run.status)
        )
          latestTestRuns[run.testId] = {
            status: run.status as 'passed' | 'failed' | 'cancelled' | 'timedOut',
            durationMs: run.durationMs,
            startedAt: instant(run.startedAt),
          };
      const runRows =
        projectIds.length === 0
          ? []
          : await tx
              .select()
              .from(testRuns)
              .where(and(inArray(testRuns.projectId, projectIds), eq(testRuns.status, 'running')))
              .orderBy(asc(testRuns.startedAt));
      const recentRunRows =
        projectIds.length === 0
          ? []
          : await tx
              .select()
              .from(testRuns)
              .where(and(inArray(testRuns.projectId, projectIds), isNotNull(testRuns.finishedAt)))
              .orderBy(desc(testRuns.startedAt))
              .limit(200);

      const ownerUsers =
        projectRows.length === 0
          ? []
          : await tx
              .select({ id: users.id, email: users.email, name: users.name })
              .from(users)
              .where(
                inArray(
                  users.id,
                  projectRows.map((project) => project.ownerId),
                ),
              );
      const ownerById = new Map(ownerUsers.map((owner) => [owner.id, owner]));
      const ownerMembers = projectRows.map((project) =>
        projectMemberSchema.parse({
          projectId: project.id,
          user: ownerById.get(project.ownerId),
          role: 'owner',
          status: 'active',
          joinedAt: instant(project.createdAt),
        }),
      );
      const memberRows =
        projectIds.length === 0
          ? []
          : await tx
              .select({
                member: projectMembers,
                user: { id: users.id, email: users.email, name: users.name },
              })
              .from(projectMembers)
              .innerJoin(users, eq(users.id, projectMembers.userId))
              .where(inArray(projectMembers.projectId, projectIds))
              .orderBy(asc(projectMembers.joinedAt));
      const memberValues = memberRows.map(({ member, user: memberUser }) =>
        projectMemberSchema.parse({
          projectId: member.projectId,
          user: memberUser,
          role: 'member',
          status: member.blockedAt ? 'blocked' : 'active',
          joinedAt: instant(member.joinedAt),
        }),
      );
      const invitationRows =
        projectIds.length === 0
          ? []
          : await tx
              .select()
              .from(projectInvitations)
              .where(inArray(projectInvitations.projectId, projectIds))
              .orderBy(desc(projectInvitations.createdAt));
      const pendingInvitationRows = await tx
        .select()
        .from(projectInvitations)
        .where(
          and(eq(projectInvitations.email, user.email), eq(projectInvitations.status, 'invited')),
        )
        .orderBy(asc(projectInvitations.createdAt));
      const invitationValues = await Promise.all(
        invitationRows.map((invitation) => this.invitation(tx, invitation)),
      );
      const pendingInvitationValues = await Promise.all(
        pendingInvitationRows.map((invitation) => this.invitation(tx, invitation)),
      );
      const activityRows =
        projectIds.length === 0
          ? []
          : await tx
              .select({
                activity: projectActivity,
                actor: { id: users.id, email: users.email, name: users.name },
              })
              .from(projectActivity)
              .innerJoin(users, eq(users.id, projectActivity.actorId))
              .where(inArray(projectActivity.projectId, projectIds))
              .orderBy(desc(projectActivity.createdAt), desc(projectActivity.id))
              .limit(200);
      const recentActivity = activityRows.map(({ activity, actor }) =>
        projectActivitySchema.parse({
          id: activity.id,
          projectId: activity.projectId,
          actor,
          action: activity.action,
          entity: {
            type: activity.entityType,
            id: activity.entityId,
            label: activity.entityLabel,
          },
          createdAt: instant(activity.createdAt),
        }),
      );
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setUTCHours(0, 0, 0, 0);
      thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 29);
      const projectOverviews = projectValues.map((project) => {
        const projectTests = testValues.filter(
          (snapshot) => snapshot.test.projectId === project.id,
        );
        const projectRuns = completedRunRows.filter((run) => run.projectId === project.id);
        const recentRuns = projectRuns.filter(
          (run) => new Date(run.startedAt).getTime() >= thirtyDaysAgo.getTime(),
        );
        const days = new Map<
          string,
          { date: string; passed: number; failed: number; cancelled: number; timedOut: number }
        >();
        for (const run of recentRuns) {
          const date = instant(run.startedAt).slice(0, 10);
          const day = days.get(date) ?? { date, passed: 0, failed: 0, cancelled: 0, timedOut: 0 };
          if (run.status === 'passed') day.passed += 1;
          if (run.status === 'failed') day.failed += 1;
          if (run.status === 'cancelled') day.cancelled += 1;
          if (run.status === 'timedOut') day.timedOut += 1;
          days.set(date, day);
        }
        const latest = projectTests
          .map((snapshot) => latestTestRuns[snapshot.test.id])
          .filter((run) => run !== undefined);
        return projectOverviewSummarySchema.parse({
          projectId: project.id,
          suiteCount: testSuiteValues.filter((suite) => suite.projectId === project.id).length,
          testCount: projectTests.length,
          passedCount: latest.filter((run) => run.status === 'passed').length,
          failedCount: latest.filter((run) => run.status === 'failed' || run.status === 'timedOut')
            .length,
          noResultCount:
            projectTests.length -
            latest.filter(
              (run) =>
                run.status === 'passed' || run.status === 'failed' || run.status === 'timedOut',
            ).length,
          runCount30d: recentRuns.length,
          activeRunCount: runRows.filter((run) => run.projectId === project.id).length,
          lastRunAt:
            projectRuns.length === 0
              ? null
              : instant(projectRuns[projectRuns.length - 1]!.startedAt),
          runDays: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
        });
      });
      return workspaceSnapshotSchema.parse({
        viewer: user,
        members: [...ownerMembers, ...memberValues],
        invitations: invitationValues,
        pendingInvitations: pendingInvitationValues,
        projects: projectValues,
        environments: environmentValues,
        profiles: profileValues,
        testSuites: testSuiteValues,
        tests: testValues,
        deletedTestSuites: deletedTestSuiteValues,
        deletedTests: deletedTestValues,
        latestTestRuns,
        projectOverviews,
        recentActivity,
        recentRuns: recentRunRows.map((row) => this.run(row)),
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
        .set({
          title: request.content.title,
          currentRevisionId: revision.id,
          currentRevisionNumber: nextNumber,
        })
        .where(eq(tests.id, request.testId));
      await this.recordActivity(tx, user, {
        projectId: test.projectId,
        action: 'test.updated',
        entityType: 'test',
        entityId: test.id,
        entityLabel: request.content.title,
      });
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

  private async recordActivity(
    tx: Transaction,
    user: AuthenticatedUser,
    activity: {
      projectId: string;
      action: ProjectActivityAction;
      entityType: 'invitation' | 'test' | 'testSuite';
      entityId: string;
      entityLabel: string;
    },
  ): Promise<void> {
    await tx.insert(projectActivity).values({ ...activity, actorId: user.id });
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
    if (project.ownerId === user.id) return;
    const [membership] = await tx
      .select({ blockedAt: projectMembers.blockedAt })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, user.id)))
      .limit(1);
    if (!membership || membership.blockedAt)
      throw new RepositoryError('FORBIDDEN', 'You do not have access to this project.');
  }

  private async isProjectOwner(
    tx: Transaction,
    user: AuthenticatedUser,
    projectId: string,
  ): Promise<boolean> {
    const [project] = await tx
      .select({ ownerId: projects.ownerId })
      .from(projects)
      .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
      .limit(1);
    if (!project) throw new RepositoryError('NOT_FOUND', 'The project was not found.');
    return project.ownerId === user.id;
  }

  private async authorizeProjectOwner(
    tx: Transaction,
    user: AuthenticatedUser,
    projectId: string,
  ): Promise<void> {
    if (!(await this.isProjectOwner(tx, user, projectId)))
      throw new RepositoryError('FORBIDDEN', 'Only the project owner may manage members.');
  }

  private async invitation(
    tx: Transaction,
    row: typeof projectInvitations.$inferSelect,
  ): Promise<ProjectInvitation> {
    const [project] = await tx
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.id, row.projectId))
      .limit(1);
    const [inviter] = await tx
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, row.invitedBy))
      .limit(1);
    const [invitee] = await tx
      .select({ name: users.name })
      .from(users)
      .where(eq(users.email, row.email))
      .limit(1);
    if (!project || !inviter) throw new Error('Invitation relations are missing.');
    return projectInvitationSchema.parse({
      id: row.id,
      projectId: row.projectId,
      projectName: project.name,
      email: row.email,
      inviteeName: invitee?.name ?? null,
      invitedBy: inviter,
      status: row.status,
      createdAt: instant(row.createdAt),
      respondedAt: row.respondedAt ? instant(row.respondedAt) : null,
    });
  }

  private async member(
    tx: Transaction,
    row: typeof projectMembers.$inferSelect,
  ): Promise<ProjectMember> {
    const [memberUser] = await tx
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1);
    if (!memberUser) throw new Error('Project member user is missing.');
    return projectMemberSchema.parse({
      projectId: row.projectId,
      user: memberUser,
      role: 'member',
      status: row.blockedAt ? 'blocked' : 'active',
      joinedAt: instant(row.joinedAt),
    });
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

  private async authorizeEnvironment(
    tx: Transaction,
    user: AuthenticatedUser,
    environmentId: string,
  ): Promise<typeof environments.$inferSelect> {
    const [environment] = await tx
      .select()
      .from(environments)
      .where(and(eq(environments.id, environmentId), isNull(environments.deletedAt)))
      .limit(1);
    if (!environment) throw new RepositoryError('NOT_FOUND', 'The environment was not found.');
    await this.authorizeProject(tx, user, environment.projectId);
    return environment;
  }

  private async authorizeProfile(
    tx: Transaction,
    user: AuthenticatedUser,
    profileId: string,
  ): Promise<typeof profiles.$inferSelect> {
    const [profile] = await tx
      .select()
      .from(profiles)
      .where(and(eq(profiles.id, profileId), isNull(profiles.deletedAt)))
      .limit(1);
    if (!profile) throw new RepositoryError('NOT_FOUND', 'The profile was not found.');
    await this.authorizeEnvironment(tx, user, profile.environmentId);
    return profile;
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
    deletion: 'active' | 'deleted' = 'active',
  ): Promise<TestSuiteSummary[]> {
    if (projectIds.length === 0) return [];
    const suiteRows = await tx
      .select()
      .from(testSuites)
      .where(
        and(
          inArray(testSuites.projectId, projectIds),
          deletion === 'active' ? isNull(testSuites.deletedAt) : isNotNull(testSuites.deletedAt),
        ),
      )
      .orderBy(asc(testSuites.createdAt));
    const suiteIds = suiteRows.map((testSuite) => testSuite.id);
    if (suiteIds.length === 0) return [];
    const testRows = await tx
      .select({ id: tests.id, testSuiteId: tests.testSuiteId })
      .from(tests)
      .where(
        deletion === 'active'
          ? and(inArray(tests.testSuiteId, suiteIds), isNull(tests.deletedAt))
          : inArray(tests.testSuiteId, suiteIds),
      );
    const testIds = testRows.map((test) => test.id);
    const runRows =
      testIds.length === 0
        ? []
        : await tx
            .select({
              testId: testRuns.testId,
              status: testRuns.status,
              durationMs: testRuns.durationMs,
              startedAt: testRuns.startedAt,
            })
            .from(testRuns)
            .where(inArray(testRuns.testId, testIds))
            .orderBy(asc(testRuns.startedAt));
    const latestStatus = new Map<string, (typeof runRows)[number]['status']>();
    const latestCompletedDuration = new Map<string, number>();
    const latestRunAt = new Map<string, string>();
    for (const run of runRows) {
      latestStatus.set(run.testId, run.status);
      if (run.durationMs !== null) {
        latestCompletedDuration.set(run.testId, run.durationMs);
        latestRunAt.set(run.testId, instant(run.startedAt));
      }
    }
    return suiteRows.map((testSuite) => {
      const suiteTests = testRows.filter((test) => test.testSuiteId === testSuite.id);
      return testSuiteSummarySchema.parse({
        ...this.testSuite(testSuite),
        testCount: suiteTests.length,
        failedCount: suiteTests.filter((test) =>
          ['failed', 'timedOut'].includes(latestStatus.get(test.id) ?? ''),
        ).length,
        totalLatestDurationMs: suiteTests.reduce(
          (total, test) => total + (latestCompletedDuration.get(test.id) ?? 0),
          0,
        ),
        lastRunAt:
          suiteTests
            .map((test) => latestRunAt.get(test.id))
            .filter((value) => value !== undefined)
            .sort()
            .at(-1) ?? null,
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
        title: test.title,
        currentRevision: { id: test.currentRevisionId, number: test.currentRevisionNumber },
        createdAt: instant(test.createdAt),
        createdBy: test.createdBy,
        deletion:
          test.deletedAt && test.deletedBy
            ? { status: 'deleted', deletedAt: instant(test.deletedAt), deletedBy: test.deletedBy }
            : activeDeletion,
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

  private async profile(tx: Transaction, row: typeof profiles.$inferSelect): Promise<Profile> {
    const variables = await tx
      .select({
        name: profileVariables.name,
        value: profileVariables.value,
        sensitive: profileVariables.sensitive,
      })
      .from(profileVariables)
      .where(eq(profileVariables.profileId, row.id))
      .orderBy(asc(profileVariables.name));
    return profileSchema.parse({
      id: row.id,
      environmentId: row.environmentId,
      name: row.name,
      authenticationType: row.authenticationType,
      variables,
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
      error: row.error,
    };
  }
}
