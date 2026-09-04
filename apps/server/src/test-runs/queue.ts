import path from 'node:path';

import { and, asc, eq, isNull, lte } from 'drizzle-orm';

import { nextCronOccurrence } from '@testron/domain/scheduling/cron';
import { browserStorageStateSchema, testRevisionContentSchema } from '@testron/protocol';
import type { Database } from '../database/database.js';
import {
  environments,
  profileVariables,
  profiles,
  runSchedules,
  runScheduleTests,
  serverRunJobs,
  testRevisions,
  testRuns,
  tests,
} from '../database/schema.js';
import type { ServerAuthenticationStateStore } from '../authentication-state/store.js';
import { ServerPlaywrightRunner, type ServerRunResult } from './runner.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type JobRow = typeof serverRunJobs.$inferSelect;

interface ClaimedRun {
  job: JobRow;
  runId: string;
  content: ReturnType<typeof testRevisionContentSchema.parse>;
  environment: typeof environments.$inferSelect;
  profile?: typeof profiles.$inferSelect;
  variables: Array<typeof profileVariables.$inferSelect>;
}

const revisionContent = (value: unknown): ReturnType<typeof testRevisionContentSchema.parse> => {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    if (!('environmentIds' in value) && 'environmentId' in value) {
      const { environmentId, ...rest } = value as Record<string, unknown>;
      return testRevisionContentSchema.parse({ ...rest, environmentIds: [environmentId] });
    }
  }
  return testRevisionContentSchema.parse(value);
};

const redact = (message: string, values: readonly string[]): string => {
  let result = message;
  for (const value of values) if (value) result = result.replaceAll(value, '[REDACTED]');
  return result.slice(0, 10_000);
};

export class ServerRunQueue {
  private timer?: ReturnType<typeof setInterval>;
  private scheduling: Promise<void> | undefined;
  private processing: Promise<void> | undefined;
  private closing = false;

  constructor(
    private readonly db: Database,
    private readonly artifactsDirectory: string,
    private readonly authenticationStates?: ServerAuthenticationStateStore,
    private readonly timeoutMs = 60_000,
    private readonly runner: Pick<ServerPlaywrightRunner, 'run'> = new ServerPlaywrightRunner(),
  ) {}

  async start(): Promise<void> {
    await this.recoverInterruptedJobs();
    this.timer = setInterval(() => this.wake(), 1_000);
    this.timer.unref();
    this.wake();
  }

  wake(): void {
    // A busy worker must not prevent the next cron occurrence being enqueued.
    void this.scheduleNow().then(() => {
      void this.processQueue();
    });
  }

  async processNow(): Promise<void> {
    await this.scheduleNow();
    await this.processQueue();
  }

  private scheduleNow(): Promise<void> {
    if (this.closing) return Promise.resolve();
    if (this.scheduling) return this.scheduling;
    const scheduling = this.enqueueDueSchedules()
      .catch((error: unknown) => console.error('Server test-run scheduling failed.', error))
      .finally(() => {
        if (this.scheduling === scheduling) this.scheduling = undefined;
      });
    this.scheduling = scheduling;
    return scheduling;
  }

  private processQueue(): Promise<void> {
    if (this.closing) return Promise.resolve();
    if (this.processing) return this.processing;
    const processing = this.tick().finally(() => {
      if (this.processing === processing) this.processing = undefined;
    });
    this.processing = processing;
    return processing;
  }

  async close(): Promise<void> {
    this.closing = true;
    if (this.timer) clearInterval(this.timer);
    await Promise.all([this.scheduling, this.processing]);
  }

  private async tick(): Promise<void> {
    try {
      while (!this.closing) {
        const claimed = await this.claimNext();
        if (claimed === undefined) break;
        if (claimed === null) continue;
        await this.execute(claimed);
      }
    } catch (error) {
      console.error('Server test-run queue processing failed.', error);
    }
  }

  private async enqueueDueSchedules(now = new Date()): Promise<void> {
    await this.db.transaction(async (tx) => {
      const due = await tx
        .select()
        .from(runSchedules)
        .where(
          and(
            eq(runSchedules.enabled, true),
            isNull(runSchedules.deletedAt),
            lte(runSchedules.nextRunAt, now.toISOString()),
          ),
        )
        .orderBy(asc(runSchedules.nextRunAt))
        .for('update', { skipLocked: true });
      for (const schedule of due) {
        const values = await this.jobValues(tx, schedule, 'server-scheduled');
        if (values.length > 0) await tx.insert(serverRunJobs).values(values);
        await tx
          .update(runSchedules)
          .set({
            lastEnqueuedAt: now.toISOString(),
            nextRunAt: nextCronOccurrence(schedule.cron, now).toISOString(),
            updatedAt: now.toISOString(),
          })
          .where(eq(runSchedules.id, schedule.id));
      }
    });
  }

  private async jobValues(
    tx: Transaction,
    schedule: typeof runSchedules.$inferSelect,
    source: 'server-scheduled',
  ): Promise<Array<typeof serverRunJobs.$inferInsert>> {
    const selected = await tx
      .select({ test: tests, revision: testRevisions })
      .from(runScheduleTests)
      .innerJoin(tests, eq(tests.id, runScheduleTests.testId))
      .innerJoin(testRevisions, eq(testRevisions.id, tests.currentRevisionId))
      .where(and(eq(runScheduleTests.scheduleId, schedule.id), isNull(tests.deletedAt)))
      .orderBy(asc(tests.createdAt));
    return selected.flatMap(({ test, revision }) => {
      const content = revisionContent(revision.content);
      if (!content.environmentIds.includes(schedule.environmentId)) return [];
      return [
        {
          projectId: schedule.projectId,
          scheduleId: schedule.id,
          testId: test.id,
          testRevisionId: revision.id,
          testRevisionNumber: revision.number,
          environmentId: schedule.environmentId,
          profileId: content.profileId ?? null,
          source,
          status: 'queued',
        },
      ];
    });
  }

  private async recoverInterruptedJobs(): Promise<void> {
    await this.db.transaction(async (tx) => {
      const interrupted = await tx
        .select()
        .from(serverRunJobs)
        .where(eq(serverRunJobs.status, 'running'))
        .for('update');
      const finishedAt = new Date().toISOString();
      for (const job of interrupted) {
        if (job.runId)
          await tx
            .update(testRuns)
            .set({
              status: 'failed',
              finishedAt,
              durationMs: Math.max(0, Date.now() - Date.parse(job.startedAt ?? finishedAt)),
              error: 'The server restarted while this run was active.',
            })
            .where(and(eq(testRuns.id, job.runId), eq(testRuns.status, 'running')));
        await tx
          .update(serverRunJobs)
          .set({ status: 'queued', runId: null, startedAt: null, error: null })
          .where(eq(serverRunJobs.id, job.id));
      }
    });
  }

  private async claimNext(): Promise<ClaimedRun | null | undefined> {
    return this.db.transaction(async (tx) => {
      const [job] = await tx
        .select()
        .from(serverRunJobs)
        .where(eq(serverRunJobs.status, 'queued'))
        .orderBy(asc(serverRunJobs.queuedAt), asc(serverRunJobs.id))
        .for('update', { skipLocked: true })
        .limit(1);
      if (!job) return undefined;
      const [[revision], [environment], profileRows, variables] = await Promise.all([
        tx.select().from(testRevisions).where(eq(testRevisions.id, job.testRevisionId)).limit(1),
        tx.select().from(environments).where(eq(environments.id, job.environmentId)).limit(1),
        job.profileId
          ? tx.select().from(profiles).where(eq(profiles.id, job.profileId)).limit(1)
          : Promise.resolve([]),
        job.profileId
          ? tx
              .select()
              .from(profileVariables)
              .where(
                and(
                  eq(profileVariables.profileId, job.profileId),
                  eq(profileVariables.environmentId, job.environmentId),
                ),
              )
          : Promise.resolve([]),
      ]);
      let content: ClaimedRun['content'];
      try {
        if (!revision || !environment)
          throw new Error('The queued run references missing execution data.');
        content = revisionContent(revision.content);
      } catch {
        await tx
          .update(serverRunJobs)
          .set({
            status: 'failed',
            finishedAt: new Date().toISOString(),
            error: 'The queued run references missing or invalid execution data.',
          })
          .where(eq(serverRunJobs.id, job.id));
        return null;
      }
      const startedAt = new Date().toISOString();
      const [run] = await tx
        .insert(testRuns)
        .values({
          projectId: job.projectId,
          testId: job.testId,
          testRevisionId: job.testRevisionId,
          testRevisionNumber: job.testRevisionNumber,
          environmentId: job.environmentId,
          profileId: job.profileId,
          status: 'running',
          source: job.source,
          startedAt,
        })
        .returning({ id: testRuns.id });
      if (!run) throw new Error('Could not start the queued server run.');
      await tx
        .update(serverRunJobs)
        .set({ status: 'running', runId: run.id, startedAt })
        .where(eq(serverRunJobs.id, job.id));
      return {
        job: { ...job, status: 'running', runId: run.id, startedAt } as JobRow,
        runId: run.id,
        content,
        environment: environment!,
        ...(profileRows[0] ? { profile: profileRows[0] } : {}),
        variables,
      };
    });
  }

  private async execute(claimed: ClaimedRun): Promise<void> {
    const values = Object.fromEntries(claimed.variables.map(({ name, value }) => [name, value]));
    const sensitiveValues = claimed.variables
      .filter(({ sensitive }) => sensitive)
      .map(({ value }) => value);
    let storageState: unknown;
    try {
      if (claimed.profile?.authenticationType === 'storage-state') {
        const value = values.storageState;
        if (!value) throw new Error('The selected storage-state profile is empty.');
        storageState = browserStorageStateSchema.parse(JSON.parse(value));
      }
      if (claimed.profile?.authenticationType === 'browser-session') {
        if (!this.authenticationStates)
          throw new Error('Server-managed authentication encryption is not configured.');
        storageState = await this.authenticationStates.getOrRefresh(
          {
            projectId: claimed.job.projectId,
            environmentId: claimed.job.environmentId,
            profileId: claimed.profile.id,
          },
          async (input) => {
            const authResult = await this.runner.run({
              environmentUrl: claimed.environment.baseUrl,
              steps: input.setupTest.steps.map(({ payload }) => payload),
              environmentVariables: input.secrets,
              timeoutMs: this.timeoutMs,
              artifactsDirectory: path.join(
                this.artifactsDirectory,
                claimed.runId,
                'authentication',
              ),
              captureArtifacts: false,
              captureStorageState: true,
            });
            if (authResult.status !== 'passed' || !authResult.storageState)
              throw new Error(authResult.error ?? 'The browser authentication flow failed.');
            return authResult.storageState;
          },
        );
      }
      const result = await this.runner.run({
        environmentUrl: claimed.environment.baseUrl,
        steps: claimed.content.steps.map(({ payload }) => payload),
        environmentVariables: claimed.profile?.authenticationType === 'credentials' ? values : {},
        timeoutMs: this.timeoutMs,
        artifactsDirectory: path.join(this.artifactsDirectory, claimed.runId),
        ...(storageState ? { storageState: storageState as never } : {}),
        ...(claimed.profile?.authenticationType === 'cookies'
          ? {
              cookies: claimed.variables.map(({ name, value }) => ({
                name,
                value,
                url: claimed.environment.baseUrl,
              })),
            }
          : {}),
        ...(claimed.profile?.authenticationType === 'headers'
          ? { headers: { origin: claimed.environment.baseUrl, values } }
          : {}),
      });
      await this.finish(claimed, {
        ...result,
        error: result.error ? redact(result.error, sensitiveValues) : null,
        steps: result.steps.map((step) => ({
          ...step,
          error: step.error ? redact(step.error, sensitiveValues) : null,
        })),
      });
    } catch (error) {
      const message = redact(
        error instanceof Error ? error.message : String(error),
        sensitiveValues,
      );
      await this.finish(claimed, {
        status: 'failed',
        durationMs: Math.max(0, Date.now() - Date.parse(claimed.job.startedAt!)),
        error: message,
        screenshotPath: null,
        videoPath: null,
        steps: [],
      });
    }
  }

  private async finish(claimed: ClaimedRun, result: ServerRunResult): Promise<void> {
    const finishedAt = new Date().toISOString();
    await this.db.transaction(async (tx) => {
      await tx
        .update(testRuns)
        .set({
          status: result.status,
          finishedAt,
          durationMs: result.durationMs,
          error: result.error,
          screenshotPath: result.screenshotPath,
          videoPath: result.videoPath,
          steps: result.steps,
        })
        .where(eq(testRuns.id, claimed.runId));
      await tx
        .update(serverRunJobs)
        .set({ status: result.status, finishedAt, error: result.error })
        .where(eq(serverRunJobs.id, claimed.job.id));
    });
  }
}
