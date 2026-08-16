import type { AppSnapshot } from '../../preload/api';
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

const replayRun = (snapshot: AppSnapshot, fullSteps: readonly RecordedStep[]): Run[] => {
  const replay = snapshot.replay;
  if (replay.status === 'idle') return [];
  const environment = snapshot.library.environments.find(
    (one) => one.id === snapshot.library.selectedEnvironmentId,
  );
  const failed = replay.steps.find((step) => step.status === 'failed');
  const completed = replay.steps.filter((step) => {
    const displayed = fullSteps[step.index];
    return step.status === 'passed' && displayed && !displayed.kind.startsWith('assert');
  }).length;
  const verdict: Run['verdict'] =
    replay.status === 'running'
      ? 'running'
      : replay.status === 'passed'
        ? 'passed'
        : replay.status === 'cancelled'
          ? 'cancelled'
          : 'failed';

  return [
    {
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
      completed,
    },
  ];
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

  return {
    detail: {
      project: context.project,
      suite: 'Tests',
      name: context.title,
      file: context.file,
      environments: [context.environment],
      tags: [],
      createdAt: displayDate(selectedTest?.createdAt),
      updatedAt: displayDate(selectedTest?.updatedAt),
      createdBy: 'Local workspace',
    },
    prerequisites: [],
    steps,
    assertions,
    runs: replayRun(snapshot, fullSteps),
    fullSteps,
  };
};
