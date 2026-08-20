import { describe, expect, it } from 'vitest';

import type { ProjectOverviewSummary } from '@testron/protocol';
import { mapProjectOverview } from '../../src/renderer/dashboard/overview-data';

const summary = (patch: Partial<ProjectOverviewSummary> = {}): ProjectOverviewSummary => ({
  projectId: '00000000-0000-4000-8000-000000000001',
  suiteCount: 2,
  testCount: 4,
  passedCount: 2,
  failedCount: 1,
  noResultCount: 1,
  runCount30d: 5,
  activeRunCount: 1,
  lastRunAt: '2026-08-20T09:30:00.000Z',
  runDays: [{ date: '2026-08-20', passed: 2, failed: 1, cancelled: 1, timedOut: 1 }],
  ...patch,
});

describe('dashboard overview mapping', () => {
  it('maps authoritative counts and run outcomes into widgets and chart series', () => {
    const result = mapProjectOverview(summary(), new Date('2026-08-20T10:00:00.000Z'));

    expect(result.totals).toEqual({ tests: 4, passed: 2, failed: 1, skipped: 1 });
    expect(result.passRate).toBeCloseTo(66.667);
    expect(result.runs).toBe(5);
    expect(result.runsInFlight).toBe(1);
    expect(result.lastRunMinutesAgo).toBe(30);
    expect(result.days.at(-1)).toMatchObject({ passed: 2, failed: 2, skipped: 1 });
  });

  it('keeps a zero-data project finite and explicitly without a pass rate or last run', () => {
    const result = mapProjectOverview(
      summary({
        suiteCount: 0,
        testCount: 0,
        passedCount: 0,
        failedCount: 0,
        noResultCount: 0,
        runCount30d: 0,
        activeRunCount: 0,
        lastRunAt: null,
        runDays: [],
      }),
      new Date('2026-08-20T10:00:00.000Z'),
    );

    expect(result.passRate).toBeNull();
    expect(result.lastRunMinutesAgo).toBeNull();
    expect(result.days).toHaveLength(30);
    expect(result.days.every((day) => day.passed + day.failed + day.skipped === 0)).toBe(true);
  });
});
