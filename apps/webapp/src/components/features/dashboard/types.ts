export type StepKind = 'goto' | 'click' | 'fill' | 'select' | 'check' | 'wait' | 'expect';
export type StepState = 'passed' | 'failed' | 'skipped';
export type RunVerdict = 'passed' | 'failed' | 'flaky' | 'skipped';
export type Severity = 'critical' | 'serious' | 'warning';
export type FailureKind = 'new' | 'flaky' | 'known';

export type RunStep = {
  id: string;
  call: string;
  target: string;
  /** The same step written for a human running it by hand. */
  manual: string;
  expected: string;
  ms: number;
  state: StepState;
};

export type Failure = {
  id: string;
  signature: string;
  message: string;
  test: string;
  file: string;
  suite: string;
  env: string;
  browser: string;
  owner: string;
  ageMinutes: number;
  occurrences: number;
  kind: FailureKind;
  severity: Severity;
  locator: string;
  runId: string;
  spark: number[];
  steps: RunStep[];
  history: RunVerdict[];
};

export type TestRecord = {
  id: string;
  name: string;
  status: StepState;
  minutesAgo: number;
  seconds?: number;
  failureId?: string;
  deleted?: boolean;
};

export type SuiteRecord = {
  id: string;
  projectId?: string;
  name: string;
  owner: string;
  tests: TestRecord[];
  lastRunMinutesAgo: number | null;
  /** A display-only group for tests that do not belong to a persisted suite. */
  synthetic?: boolean;
  deleted?: boolean;
  revision?: number;
  testCount?: number;
  failedCount?: number;
  totalLatestDurationMs?: number;
};

export type DayRecord = {
  key: string;
  weekday: string;
  dayOfMonth: number;
  passed: number;
  skipped: number;
  failed: number;
};

export type ActivityKind = 'added' | 'updated' | 'recorded' | 'fixed';

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  test: string;
  suite: string;
  author: string;
  minutesAgo: number;
};

export type Totals = { tests: number; passed: number; skipped: number; failed: number };

/** A tester's call on a manual step. */
export type ManualVerdict = 'pass' | 'fail' | 'block';

export type Scope = 'all' | 'new' | 'flaky' | 'mine';
export type View = 'overview' | 'triage' | 'runs' | 'members';
export type EvidenceTab = 'steps' | 'error' | 'shot' | 'manual' | 'history';
export type SortKey = 'name' | 'tests' | 'passRate' | 'lastRun';
export type Sort = { key: SortKey; direction: 'asc' | 'desc' };
