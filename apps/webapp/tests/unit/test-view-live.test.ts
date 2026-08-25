import { describe, expect, it } from 'vitest';

import { liveTestBoard } from '../../src/components/features/test-view/live';
import type { AppSnapshot } from '../../src/lib/library';
import type { TestRun } from '@testron/protocol';

const snapshot: AppSnapshot = {
  title: 'Untitled test',
  verifyAssertion: 'visible',
  recording: false,
  status: 'finished',
  currentUrl: 'http://127.0.0.1:4174/welcome',
  captureMode: 'record',
  canUndo: true,
  canRedo: false,
  descriptions: [],
  source: "test('sign in', async ({ page }) => {});\n",
  stepWarnings: [[], [], []],
  steps: [
    {
      version: 1,
      kind: 'fill',
      target: {
        primary: { strategy: 'label', text: 'Email' },
        alternatives: [],
      },
      value: 'qa@example.test',
      metadata: { recordedAt: '2026-08-16T10:00:00.000Z' },
    },
    {
      version: 1,
      kind: 'assertElement',
      target: {
        primary: { strategy: 'role', role: 'status', name: 'Welcome' },
        alternatives: [],
      },
      assertion: { type: 'visible' },
      metadata: { recordedAt: '2026-08-16T10:00:01.000Z' },
    },
    {
      version: 1,
      kind: 'click',
      target: {
        primary: { strategy: 'role', role: 'button', name: 'Continue' },
        alternatives: [],
      },
      metadata: { recordedAt: '2026-08-16T10:00:02.000Z' },
    },
  ],
  library: {
    profiles: [],
    profileVariables: [],
    projects: [{ id: 'project', name: 'Accounts' }],
    environments: [
      {
        id: 'environment',
        projectId: 'project',
        name: 'Local',
        baseUrl: 'http://127.0.0.1:4174',
        testIdAttribute: 'data-testid',
        authRevision: 1,
      },
    ],
    testSuites: [],
    tests: [
      {
        id: 'test',
        projectId: 'project',
        environmentId: 'environment',
        title: 'sign in',
        prerequisites: ['Signed in as an administrator'],
        createdAt: '2026-08-16T10:00:00.000Z',
        updatedAt: '2026-08-16T10:05:00.000Z',
      },
    ],
    selectedProjectId: 'project',
    selectedEnvironmentId: 'environment',
    selectedTestId: 'test',
  },
  replay: {
    status: 'failed',
    startedAt: '2026-08-16T10:06:00.000Z',
    durationMs: 1200,
    steps: [
      { index: 0, action: 'Fill Email', status: 'passed' },
      { index: 1, action: 'Verify Welcome', status: 'failed', error: 'not visible' },
      { index: 2, action: 'Click Continue', status: 'pending' },
    ],
  },
  replayHistory: [],
};

const serverRun = (overrides: Partial<TestRun> = {}): TestRun => ({
  id: 'server-run',
  projectId: 'project',
  testId: 'test',
  testRevision: 1,
  environmentId: 'environment',
  profileId: null,
  status: 'running',
  source: 'desktop-local',
  startedAt: '2026-08-16T10:07:00.000Z',
  finishedAt: null,
  durationMs: null,
  error: null,
  ...overrides,
});

describe('live test board', () => {
  it('projects selected persisted data into actions, anchored assertions, and a real run', () => {
    const board = liveTestBoard(snapshot);

    expect(board.detail).toMatchObject({
      project: 'Accounts',
      name: 'sign in',
      environments: ['Local'],
      file: 'tests/sign-in.spec.ts',
    });
    expect(board.steps.map((step) => step.kind)).toEqual(['fill', 'click']);
    expect(board.prerequisites).toEqual(['Signed in as an administrator']);
    expect(board.assertions).toMatchObject([{ afterStep: 1, label: 'Welcome', kind: 'visible' }]);
    expect(board.runs).toMatchObject([
      {
        verdict: 'failed',
        environment: 'Local',
        seconds: 1.2,
        completed: 1,
        failedStepId: board.fullSteps[1].id,
        error: 'not visible',
      },
    ]);
  });

  it('keeps a separate card for every replay in the current session', () => {
    const previous = {
      status: 'passed' as const,
      startedAt: '2026-08-16T10:05:00.000Z',
      durationMs: 800,
      steps: snapshot.steps.map((_, index) => ({
        index,
        action: `Step ${index + 1}`,
        status: 'passed' as const,
      })),
    };
    const board = liveTestBoard({
      ...snapshot,
      replayHistory: [snapshot.replay, previous],
    });

    expect(board.runs).toHaveLength(2);
    expect(board.runs.map((run) => run.verdict)).toEqual(['failed', 'passed']);
    expect(board.runs[0].id).not.toBe(board.runs[1].id);
  });

  it('shows active server runs immediately', () => {
    const board = liveTestBoard({
      ...snapshot,
      replay: { status: 'idle', steps: [] },
      library: {
        ...snapshot.library,
        activeRuns: [serverRun()],
        recentRuns: [],
      },
    });

    expect(board.runs).toMatchObject([
      {
        id: 'server-run-server-run',
        verdict: 'running',
        environment: 'Local',
        seconds: 0,
        completed: 0,
      },
    ]);
  });

  it('replaces an active server run with its completed recent run', () => {
    const board = liveTestBoard({
      ...snapshot,
      replay: { status: 'idle', steps: [] },
      library: {
        ...snapshot.library,
        activeRuns: [serverRun()],
        recentRuns: [
          serverRun({
            status: 'passed',
            finishedAt: '2026-08-16T10:07:02.000Z',
            durationMs: 2000,
          }),
        ],
      },
    });

    expect(board.runs).toHaveLength(1);
    expect(board.runs[0]).toMatchObject({
      id: 'server-run-server-run',
      verdict: 'passed',
      seconds: 2,
      completed: board.fullSteps.length,
    });
  });
});
