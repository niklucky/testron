/**
 * One execution of a test.
 *
 * The shapes here follow what the replay runner already produces — see
 * ReplayStepResult and ReplaySnapshot in main/replay/runner.ts: a status and a
 * duration per step, the page URL it was on, the error that stopped it, and
 * two artifacts on disk (trace.zip and a full-page failure.png).
 *
 * Three things on this screen are *not* captured yet and are marked as such
 * where they appear: console output, video, and retries. Each is a small
 * addition to the runner rather than a new idea (page.on('console'),
 * recordVideo, and a retry loop), and the screen is honest about which
 * evidence exists today.
 */

export type StepStatus = 'passed' | 'failed' | 'skipped' | 'running';

export type StepResult = {
  /** Index into the flattened step list the run executed. */
  index: number;
  status: StepStatus;
  ms: number;
  url: string;
  error?: string;
};

export type Verdict = 'passed' | 'failed' | 'flaky' | 'cancelled' | 'timedOut';

export type Attempt = {
  number: number;
  verdict: Exclude<Verdict, 'flaky'>;
  ms: number;
  steps: StepResult[];
  failedIndex?: number;
  error?: string;
};

export type ConsoleLine = {
  id: string;
  level: 'log' | 'warn' | 'error';
  atMs: number;
  text: string;
};

export type Artifact = {
  id: string;
  name: string;
  kind: 'trace' | 'screenshot' | 'console' | 'video' | 'network';
  size?: string;
  /** False when the runner does not record this yet. */
  captured: boolean;
  hint?: string;
};

export type RunReport = {
  id: string;
  verdict: Verdict;
  environment: string;
  baseUrl: string;
  browser: string;
  viewport: string;
  trigger: 'manual' | 'ci' | 'schedule';
  by: string;
  branch: string;
  commit: string;
  startedAt: string;
  minutesAgo: number;
  ms: number;
  worker: string;
  timeoutMs: number;
  /** Environment variable names the run needed. Values never leave the shell. */
  secrets: string[];
  authState: string;
  attempts: Attempt[];
  console: ConsoleLine[];
  artifacts: Artifact[];
};
