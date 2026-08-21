import type { ProjectOverviewSummary } from '@testron/protocol';

import type { DayRecord, Totals } from './types';

export type LiveOverview = {
  totals: Totals;
  passRate: number | null;
  runs: number;
  runsInFlight: number;
  lastRunMinutesAgo: number | null;
  days: DayRecord[];
};

const dayKey = (date: Date): string => date.toISOString().slice(0, 10);

/** Maps the server snapshot to renderer values without inventing missing history. */
export const mapProjectOverview = (
  summary: ProjectOverviewSummary,
  now = new Date(),
): LiveOverview => {
  const byDate = new Map(summary.runDays.map((day) => [day.date, day]));
  const days = Array.from({ length: 30 }, (_, index): DayRecord => {
    const date = new Date(now);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (29 - index));
    const key = dayKey(date);
    const source = byDate.get(key);
    return {
      key,
      weekday: date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      dayOfMonth: date.getUTCDate(),
      passed: source?.passed ?? 0,
      failed: (source?.failed ?? 0) + (source?.timedOut ?? 0),
      skipped: source?.cancelled ?? 0,
    };
  });
  const decided = summary.passedCount + summary.failedCount;

  return {
    totals: {
      tests: summary.testCount,
      passed: summary.passedCount,
      failed: summary.failedCount,
      skipped: summary.noResultCount,
    },
    passRate: decided === 0 ? null : (summary.passedCount / decided) * 100,
    runs: summary.runCount30d,
    runsInFlight: summary.activeRunCount,
    lastRunMinutesAgo:
      summary.lastRunAt === null
        ? null
        : Math.max(0, Math.floor((now.getTime() - Date.parse(summary.lastRunAt)) / 60_000)),
    days,
  };
};
