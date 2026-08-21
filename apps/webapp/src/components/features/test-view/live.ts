import type { AppSnapshot } from '../../../lib/library';
import type { TestRun } from '@testron/protocol';
import { presentRecordedSteps, recordingContext } from '../record/live';
import type { RecordedStep } from '../record/types';
import type { Assertion, Run, TestBoard } from './types';

const assertionFrom = (step: RecordedStep, afterStep: number): Assertion => ({
  id: step.id,
  afterStep: Math.max(1, afterStep),
  label: step.label,
  locator: step.locator,
  kind:
    step.kind === 'assertUrl'
      ? 'urlPath'
      : step.assertion === 'textEquals' || step.assertion === 'textContains'
        ? step.assertion
        : (step.assertion ?? 'visible'),
  expected: step.value ?? '',
});

const displayDate = (value: string | undefined): string => {
  if (!value) return 'Not saved yet';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
};

const replayRun = (
  snapshot: AppSnapshot,
  fullSteps: readonly RecordedStep[],
  replay: AppSnapshot['replay'],
): Run | undefined => {
  if (replay.status === 'idle') return undefined;
  const environment = snapshot.library.environments.find(
    (one) => one.id === snapshot.library.selectedEnvironmentId,
  );
  const failed = replay.steps.find((step) => step.status === 'failed');
  const completed = replay.steps.filter((step) => step.status === 'passed').length;
  const verdict: Run['verdict'] =
    replay.status === 'running'
      ? 'running'
      : replay.status === 'passed'
        ? 'passed'
        : replay.status === 'cancelled'
          ? 'cancelled'
          : 'failed';

  return {
    id: replay.startedAt ? `run-${replay.startedAt}` : 'current-run',
    verdict,
    environment: environment?.name ?? 'Local',
    seconds: (replay.durationMs ?? 0) / 1_000,
    minutesAgo: replay.startedAt
      ? Math.max(0, (Date.now() - Date.parse(replay.startedAt)) / 60_000)
      : 0,
    by: 'Local runner',
    trigger: 'manual',
    failedStepId: failed ? fullSteps[failed.index]?.id : undefined,
    error:
      failed?.error ??
      replay.error ??
      (replay.status === 'timedOut' ? 'The run exceeded its timeout.' : undefined),
    completed,
  };
};

const serverRun = (
  snapshot: AppSnapshot,
  fullSteps: readonly RecordedStep[],
  run: TestRun,
): Run => {
  const environment = snapshot.library.environments.find((entry) => entry.id === run.environmentId);
  return {
    id: `server-run-${run.id}`,
    verdict:
      run.status === 'passed' ? 'passed' : run.status === 'cancelled' ? 'cancelled' : 'failed',
    environment: environment?.name ?? 'Unknown environment',
    seconds: (run.durationMs ?? 0) / 1_000,
    minutesAgo: Math.max(0, (Date.now() - Date.parse(run.startedAt)) / 60_000),
    by: 'Server runner',
    trigger: 'manual',
    ...(run.error
      ? { error: run.error }
      : run.status === 'timedOut'
        ? { error: 'The run exceeded its timeout.' }
        : {}),
    completed: run.status === 'passed' ? fullSteps.length : 0,
  };
};

export const liveTestBoard = (
  snapshot: AppSnapshot,
): TestBoard & {
  fullSteps: RecordedStep[];
} => {
  const context = recordingContext(snapshot);
  const selectedTest = snapshot.library.tests.find(
    (one) => one.id === snapshot.library.selectedTestId,
  );
  const fullSteps = presentRecordedSteps(snapshot.steps);
  const steps: RecordedStep[] = [];
  const assertions: Assertion[] = [];

  for (const step of fullSteps) {
    if (step.kind === 'assert' || step.kind === 'assertUrl')
      assertions.push(assertionFrom(step, steps.length));
    else steps.push(step);
  }

  const localReplays =
    snapshot.replayHistory.length > 0
      ? snapshot.replayHistory
      : snapshot.replay.status === 'idle'
        ? []
        : [snapshot.replay];
  const localRuns = localReplays.flatMap((replay) => {
    const run = replayRun(snapshot, fullSteps, replay);
    return run ? [run] : [];
  });
  const serverRuns = (snapshot.library.recentRuns ?? [])
    .filter((run) => run.testId === selectedTest?.id)
    .filter(
      (run) =>
        !localReplays.some(
          (replay) =>
            replay.startedAt &&
            Math.abs(Date.parse(replay.startedAt) - Date.parse(run.startedAt)) < 5_000,
        ),
    )
    .map((run) => serverRun(snapshot, fullSteps, run));

  return {
    detail: {
      project: context.project,
      suite: context.suite,
      name: context.title,
      file: context.file,
      environments: [context.environment],
      tags: [],
      createdAt: displayDate(selectedTest?.createdAt),
      updatedAt: displayDate(selectedTest?.updatedAt),
      createdBy: 'Local workspace',
    },
    prerequisites: selectedTest?.prerequisites ?? [],
    steps,
    assertions,
    runs: [...localRuns, ...serverRuns].sort((a, b) => a.minutesAgo - b.minutesAgo),
    fullSteps,
  };
};
