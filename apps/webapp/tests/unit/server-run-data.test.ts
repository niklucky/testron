import { describe, expect, it } from 'vitest';

import type { LibrarySnapshot } from '../../src/lib/library';
import {
  failuresFromLibrary,
  projectRunsFromLibrary,
} from '../../src/components/features/dashboard/serverRunData';

const run = (
  id: string,
  status: 'running' | 'passed' | 'failed' | 'cancelled' | 'timedOut',
  startedAt: string,
) => ({
  id,
  projectId: 'project-1',
  testId: 'test-1',
  testRevision: { id: 'revision-1', number: 1 },
  environmentId: 'environment-1',
  status,
  source: 'desktop-local' as const,
  startedAt,
  finishedAt: status === 'running' ? null : startedAt,
  durationMs: status === 'running' ? null : 1_200,
  error:
    status === 'failed'
      ? "expect(locator).toBeHidden() failed\nfailedLocator: getByTestId('login')"
      : null,
});

const library = (overrides: Partial<LibrarySnapshot> = {}): LibrarySnapshot => ({
  projects: [{ id: 'project-1', name: 'Project' }],
  environments: [
    {
      id: 'environment-1',
      projectId: 'project-1',
      name: 'Staging',
      baseUrl: 'https://example.com',
      testIdAttribute: 'data-testid',
      authRevision: 1,
    },
  ],
  profiles: [],
  profileVariables: [],
  tests: [
    {
      id: 'test-1',
      projectId: 'project-1',
      environmentId: 'environment-1',
      testSuiteId: 'suite-1',
      title: 'Checkout',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
  ],
  testSuites: [
    {
      id: 'suite-1',
      projectId: 'project-1',
      name: 'Commerce',
      revision: 1,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      deletion: { status: 'active' },
      testCount: 1,
      failedCount: 0,
      totalLatestDurationMs: 0,
      lastRunAt: null,
    },
  ],
  selectedProjectId: 'project-1',
  ...overrides,
});

describe('server dashboard run data', () => {
  it('does not triage an old failure after the test succeeds', () => {
    const failed = run('run-failed', 'failed', '2026-08-20T10:00:00.000Z');
    const passed = run('run-passed', 'passed', '2026-08-20T11:00:00.000Z');
    const snapshot = library({
      recentRuns: [passed, failed],
      latestTestRuns: {
        'test-1': {
          status: 'passed',
          durationMs: 1_200,
          startedAt: passed.startedAt,
        },
      },
    });

    expect(failuresFromLibrary(snapshot)).toEqual([]);
  });

  it('uses the latest red run for triage and retains its real server identity', () => {
    const failed = run('run-failed', 'timedOut', '2026-08-20T11:00:00.000Z');
    const snapshot = library({
      recentRuns: [failed],
      latestTestRuns: {
        'test-1': {
          status: 'timedOut',
          durationMs: 1_200,
          startedAt: failed.startedAt,
        },
      },
    });

    expect(failuresFromLibrary(snapshot)).toMatchObject([
      {
        id: 'run-failed',
        runId: 'run-failed',
        test: 'Checkout',
        suite: 'Commerce',
        env: 'Staging',
        signature: 'Run timed out',
      },
    ]);
  });

  it('shows persisted server error evidence and its locator', () => {
    const failed = run('run-failed', 'failed', '2026-08-20T11:00:00.000Z');
    const snapshot = library({
      recentRuns: [failed],
      latestTestRuns: {
        'test-1': {
          status: 'failed',
          durationMs: 1_200,
          startedAt: failed.startedAt,
        },
      },
    });

    expect(failuresFromLibrary(snapshot)).toMatchObject([
      {
        message: "expect(locator).toBeHidden() failed\nfailedLocator: getByTestId('login')",
        locator: "getByTestId('login')",
        signature: 'expect(locator).toBeHidden() failed',
      },
    ]);
  });

  it('projects completed and active server runs into run history', () => {
    const completed = run('run-passed', 'passed', '2026-08-20T11:00:00.000Z');
    const active = run('run-running', 'running', '2026-08-20T12:00:00.000Z');
    const rows = projectRunsFromLibrary(library({ recentRuns: [completed], activeRuns: [active] }));

    expect(rows.map(({ id, verdict }) => ({ id, verdict }))).toEqual([
      { id: 'run-running', verdict: 'running' },
      { id: 'run-passed', verdict: 'passed' },
    ]);
  });
});
