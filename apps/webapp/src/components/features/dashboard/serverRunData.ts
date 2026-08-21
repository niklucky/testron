import type { TestRun } from '@testron/protocol';

import type { LibrarySnapshot } from '../../../lib/library';
import type { Failure, RunVerdict } from './types';
import type { ProjectRun } from './runHistory';

const minutesSince = (startedAt: string) =>
  Math.max(0, (Date.now() - Date.parse(startedAt)) / 60_000);

const latestFirst = (left: TestRun, right: TestRun) =>
  Date.parse(right.startedAt) - Date.parse(left.startedAt);

const runVerdict = (status: TestRun['status']): ProjectRun['verdict'] => {
  if (status === 'running') return 'running';
  if (status === 'passed') return 'passed';
  if (status === 'cancelled') return 'skipped';
  return 'failed';
};

const historyVerdict = (status: TestRun['status']): RunVerdict => {
  if (status === 'passed') return 'passed';
  if (status === 'cancelled' || status === 'running') return 'skipped';
  return 'failed';
};

const errorSignature = (run: TestRun): string => {
  if (run.status === 'timedOut') return 'Run timed out';
  const firstLine = run.error
    ?.split('\n')
    .find((line) => line.trim())
    ?.trim();
  return firstLine ? firstLine.slice(0, 100) : 'Run failed';
};

const locatorFromError = (error: string | null | undefined): string =>
  error?.match(/failedLocator:\s*([^\n]+)/)?.[1]?.trim() ?? 'Not captured by the server';

export const projectRunsFromLibrary = (library: LibrarySnapshot): ProjectRun[] => {
  const projectId = library.selectedProjectId;
  const tests = new Map(library.tests.map((test) => [test.id, test]));
  const suites = new Map(library.testSuites.map((suite) => [suite.id, suite]));
  const environments = new Map(
    library.environments.map((environment) => [environment.id, environment]),
  );
  const completed = library.recentRuns ?? [];
  const active = library.activeRuns ?? [];

  return [...active, ...completed]
    .filter((run) => run.projectId === projectId)
    .sort(latestFirst)
    .map((run): ProjectRun => {
      const test = tests.get(run.testId);
      const suite = test?.testSuiteId ? suites.get(test.testSuiteId) : undefined;
      const failed = run.status === 'failed' || run.status === 'timedOut';
      return {
        id: run.id,
        test: test?.title ?? 'Unknown test',
        suite: suite?.name ?? 'Unassigned',
        verdict: runVerdict(run.status),
        environment: environments.get(run.environmentId)?.name ?? 'Unknown environment',
        browser: '—',
        branch: '—',
        commit: '—',
        trigger: 'manual',
        by: 'Desktop runner',
        minutesAgo: minutesSince(run.startedAt),
        seconds: (run.durationMs ?? 0) / 1_000,
        attempts: 1,
        steps: 0,
        ...(failed ? { signature: errorSignature(run) } : {}),
      };
    });
};

/**
 * One triage entry per test whose latest completed run is still red. The
 * latestTestRuns projection is authoritative, so a later green run closes the
 * failure even when the older red run is still present in recentRuns.
 */
export const failuresFromLibrary = (library: LibrarySnapshot): Failure[] => {
  const projectId = library.selectedProjectId;
  const tests = library.tests.filter((test) => test.projectId === projectId);
  const suites = new Map(library.testSuites.map((suite) => [suite.id, suite]));
  const environments = new Map(
    library.environments.map((environment) => [environment.id, environment]),
  );
  const runsByTest = new Map<string, TestRun[]>();

  for (const run of library.recentRuns ?? []) {
    if (run.projectId !== projectId || run.status === 'running') continue;
    runsByTest.set(run.testId, [...(runsByTest.get(run.testId) ?? []), run]);
  }
  for (const runs of runsByTest.values()) runs.sort(latestFirst);

  return tests
    .flatMap((test): Failure[] => {
      const latest = library.latestTestRuns?.[test.id];
      if (!latest || (latest.status !== 'failed' && latest.status !== 'timedOut')) return [];

      const historyRuns = runsByTest.get(test.id) ?? [];
      const matchingRun = historyRuns.find(
        (run) => run.startedAt === latest.startedAt && run.status === latest.status,
      );
      const failedRuns = historyRuns.filter(
        (run) => run.status === 'failed' || run.status === 'timedOut',
      );
      const recentHistory = [...historyRuns]
        .reverse()
        .slice(-24)
        .map((run) => historyVerdict(run.status));
      const history = matchingRun
        ? recentHistory
        : [...recentHistory, 'failed' as const].slice(-24);
      const hasPassed = history.includes('passed');
      const suite = test.testSuiteId ? suites.get(test.testSuiteId) : undefined;
      const environment = matchingRun
        ? environments.get(matchingRun.environmentId)
        : environments.get(test.environmentId);
      const timedOut = latest.status === 'timedOut';
      const ageMinutes = minutesSince(latest.startedAt);
      const latestFailureDay = Math.floor(ageMinutes / 1_440);
      const error = matchingRun?.error;

      return [
        {
          id: matchingRun?.id ?? `latest-${test.id}`,
          signature: matchingRun
            ? errorSignature(matchingRun)
            : timedOut
              ? 'Run timed out'
              : 'Run failed',
          message:
            error ??
            (timedOut
              ? 'The test run exceeded its timeout.'
              : 'The server recorded this test run as failed. Detailed error evidence was not uploaded.'),
          test: test.title,
          file: 'Server run',
          suite: suite?.name ?? 'Unassigned',
          env: environment?.name ?? 'Unknown environment',
          browser: 'Desktop runner',
          owner: library.viewer?.name ?? library.viewer?.email ?? 'Workspace owner',
          ageMinutes,
          occurrences: Math.max(1, failedRuns.length),
          kind: hasPassed ? 'flaky' : failedRuns.length <= 1 ? 'new' : 'known',
          severity: timedOut ? 'serious' : 'critical',
          locator: locatorFromError(error),
          runId: matchingRun?.id ?? 'Run details unavailable',
          spark: Array.from({ length: 7 }, (_, index) => {
            const day = 6 - index;
            return (
              failedRuns.filter((run) => Math.floor(minutesSince(run.startedAt) / 1_440) === day)
                .length + (!matchingRun && latestFailureDay === day ? 1 : 0)
            );
          }),
          steps: [],
          history,
        },
      ];
    })
    .sort((left, right) => left.ageMinutes - right.ageMinutes);
};
