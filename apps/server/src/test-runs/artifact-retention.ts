import { rm } from 'node:fs/promises';
import path from 'node:path';

import { and, asc, eq, gt, inArray, isNull, lte } from 'drizzle-orm';

import type { Database } from '../database/database.js';
import { testRuns } from '../database/schema.js';

export const ARTIFACT_RETENTION_DAYS = 30;
const retentionMs = ARTIFACT_RETENTION_DAYS * 24 * 60 * 60 * 1_000;
const cleanupIntervalMs = 60 * 60 * 1_000;
const batchSize = 100;

/** Expire evidence, not run history. Only this runner's per-run folders are removed. */
export class ServerArtifactRetention {
  private timer?: ReturnType<typeof setInterval>;
  private processing: Promise<void> | undefined;
  private closing = false;

  constructor(
    private readonly db: Database,
    private readonly artifactsDirectory: string,
  ) {}

  start(): void {
    this.timer = setInterval(() => {
      void this.processNow();
    }, cleanupIntervalMs);
    this.timer.unref();
    void this.processNow();
  }

  processNow(now = new Date()): Promise<void> {
    if (this.closing) return Promise.resolve();
    if (this.processing) return this.processing;
    const processing = this.cleanup(now)
      .catch((error: unknown) => console.error('Server artifact cleanup failed.', error))
      .finally(() => {
        if (this.processing === processing) this.processing = undefined;
      });
    this.processing = processing;
    return processing;
  }

  async close(): Promise<void> {
    this.closing = true;
    if (this.timer) clearInterval(this.timer);
    await this.processing;
  }

  private async cleanup(now: Date): Promise<void> {
    const cutoff = new Date(now.getTime() - retentionMs).toISOString();
    const root = path.resolve(this.artifactsDirectory);
    let afterId: string | undefined;
    while (!this.closing) {
      const runs = await this.db
        .select({
          id: testRuns.id,
          screenshotPath: testRuns.screenshotPath,
          videoPath: testRuns.videoPath,
        })
        .from(testRuns)
        .where(
          and(
            inArray(testRuns.source, ['server-manual', 'server-scheduled']),
            inArray(testRuns.status, ['passed', 'failed', 'timedOut', 'cancelled']),
            lte(testRuns.finishedAt, cutoff),
            isNull(testRuns.artifactsExpiredAt),
            afterId ? gt(testRuns.id, afterId) : undefined,
          ),
        )
        .orderBy(asc(testRuns.id))
        .limit(batchSize);
      if (runs.length === 0) break;
      for (const run of runs) {
        if (this.closing) return;
        try {
          // UUID IDs come from PostgreSQL, but validate before recursive removal.
          // Never use stored artifact paths as deletion targets: they can be stale
          // or outside this server's configured evidence directory.
          if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(run.id))
            throw new Error('Invalid artifact run directory ID.');
          await rm(path.join(root, run.id), { recursive: true, force: true });
          // Missing directories are fine; clear expired links too. If deletion
          // fails, retain the references and retry on the next sweep.
          await this.db
            .update(testRuns)
            .set({ screenshotPath: null, videoPath: null, artifactsExpiredAt: now.toISOString() })
            .where(eq(testRuns.id, run.id));
        } catch (error) {
          console.error(`Could not expire artifacts for server run ${run.id}.`, error);
        }
      }
      afterId = runs.at(-1)!.id;
    }
  }
}
