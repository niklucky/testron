import { board } from '../test-view/data';
import { flatten } from '../test-view/spec';
import type { Attempt, ConsoleLine, RunReport, StepResult } from './types';

/**
 * Five runs of the test on the previous screen.
 *
 * The step list is not invented here: a run executes exactly what
 * `flatten(board)` produces, so the report and the board can never disagree
 * about what was supposed to happen. Only the timings and outcomes belong to
 * the run.
 */
export const steps = flatten(board);

/** A tiny deterministic generator, so every run looks the same on every load. */
const seeded = (seed: number) => () => {
  seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
  return seed / 4_294_967_296;
};

/** Roughly what each kind of step costs, before the run's own noise. */
const baseCost = (index: number) => {
  const step = steps[index];
  if (!step) return 200;
  if (step.kind === 'navigate') return 1_400;
  if (step.kind === 'fill') return 320;
  if (step.kind.startsWith('assert')) return 180;
  return 480;
};

const attemptOf = (
  seed: number,
  number: number,
  failure?: { index: number; ms: number; error: string },
): Attempt => {
  const random = seeded(seed);
  const results: StepResult[] = steps.map((step, index) => {
    const jitter = 0.75 + random() * 0.6;
    const ms = Math.round(baseCost(index) * jitter);
    const url = step.url ?? 'https://staging.commerce.app/checkout';
    if (!failure || index < failure.index) return { index, status: 'passed', ms, url };
    if (index === failure.index)
      // A failed step costs whatever it waited before giving up.
      return { index, status: 'failed', ms: failure.ms, url, error: failure.error };
    return { index, status: 'skipped', ms: 0, url };
  });

  return {
    number,
    verdict: failure ? 'failed' : 'passed',
    ms: results.reduce((total, result) => total + result.ms, 0),
    steps: results,
    ...(failure ? { failedIndex: failure.index, error: failure.error } : {}),
  };
};

const payNowIndex = steps.findIndex((step) => step.label === 'Pay now');

const timeoutError = [
  'TimeoutError: locator.click: Timeout 5000ms exceeded.',
  'Call log:',
  "  - waiting for getByRole('button', { name: 'Pay now' })",
  '  - locator resolved to <button disabled class="primary">Pay now</button>',
  '  - element is not enabled — waiting for it to become enabled',
].join('\n');

const consoleLines = (failing: boolean): ConsoleLine[] => [
  { id: 'c1', level: 'log', atMs: 240, text: '[analytics] page_view checkout' },
  { id: 'c2', level: 'log', atMs: 1_180, text: '[basket] restored 2 items from fixtures' },
  {
    id: 'c3',
    level: 'warn',
    atMs: 2_900,
    text: 'Deprecation: `checkout.legacyTotals` will be removed in v9',
  },
  ...(failing
    ? [
        {
          id: 'c4',
          level: 'error' as const,
          atMs: 4_310,
          text: 'POST /api/payment-intents 502 (Bad Gateway)',
        },
        {
          id: 'c5',
          level: 'error' as const,
          atMs: 4_320,
          text: 'Uncaught (in promise) PaymentIntentError: gateway unavailable',
        },
      ]
    : [
        {
          id: 'c4',
          level: 'log' as const,
          atMs: 4_600,
          text: '[checkout] order NW-4471 confirmed',
        },
      ]),
];

const artifacts = (failing: boolean) => [
  {
    id: 'trace',
    name: 'trace.zip',
    kind: 'trace' as const,
    size: '1.8 MB',
    captured: true,
  },
  {
    id: 'shot',
    name: 'failure.png',
    kind: 'screenshot' as const,
    size: '284 KB',
    captured: failing,
    hint: failing ? undefined : 'Only captured when a step fails.',
  },
  {
    id: 'console',
    name: 'console.log',
    kind: 'console' as const,
    size: '3 KB',
    captured: false,
    hint: "Needs page.on('console') in the runner.",
  },
  {
    id: 'video',
    name: 'video.webm',
    kind: 'video' as const,
    captured: false,
    hint: 'Needs recordVideo on the browser context.',
  },
  {
    id: 'network',
    name: 'network.har',
    kind: 'network' as const,
    captured: false,
    hint: 'Needs recordHar on the browser context.',
  },
];

const shared = {
  environment: 'Staging',
  baseUrl: 'https://staging.commerce.app',
  browser: 'Chromium 141',
  viewport: '1280 × 800',
  worker: 'local · worker 1',
  timeoutMs: 5_000,
  secrets: ['TESTRON_CARD_NUMBER'],
  authState: 'reused · revision 4',
};

const payNowTimeout = { index: payNowIndex, ms: 5_000, error: timeoutError };

/**
 * A run lasts exactly as long as its attempts did. Deriving it here rather
 * than writing a number next to them is the difference between a report and a
 * mock-up: the rail, the stat tile and the waterfall cannot drift apart.
 */
const run = (
  report: Omit<RunReport, 'ms' | 'console' | 'artifacts' | 'verdict'> & {
    verdict?: RunReport['verdict'];
  },
): RunReport => {
  const failing = report.attempts.some((attempt) => attempt.verdict === 'failed');
  const last = report.attempts.at(-1);
  return {
    ...report,
    verdict:
      report.verdict ??
      (failing && last?.verdict === 'passed' ? 'flaky' : failing ? 'failed' : 'passed'),
    ms: report.attempts.reduce((total, attempt) => total + attempt.ms, 0),
    console: consoleLines(failing),
    artifacts: artifacts(failing),
  };
};

export const runs: RunReport[] = [
  run({
    ...shared,
    id: 'run-4471',
    trigger: 'ci',
    by: 'CI · main',
    branch: 'main',
    commit: '9f3c1ab',
    startedAt: '16 Aug 2026, 00:41',
    minutesAgo: 26,
    attempts: [attemptOf(11, 1, payNowTimeout)],
  }),
  run({
    ...shared,
    id: 'run-4468',
    trigger: 'schedule',
    by: 'Nightly',
    branch: 'main',
    commit: '9f3c1ab',
    startedAt: '16 Aug 2026, 02:10',
    minutesAgo: 190,
    // The case retries exist for: same commit, two different outcomes.
    attempts: [attemptOf(23, 1, payNowTimeout), attemptOf(31, 2)],
  }),
  run({
    ...shared,
    id: 'run-4462',
    environment: 'Preview',
    trigger: 'manual',
    by: 'Nikita S.',
    branch: 'feat/express-delivery',
    commit: '2b70d4e',
    startedAt: '15 Aug 2026, 18:04',
    minutesAgo: 640,
    attempts: [attemptOf(47, 1)],
  }),
  run({
    ...shared,
    id: 'run-4455',
    trigger: 'schedule',
    by: 'Nightly',
    branch: 'main',
    commit: '7c02e15',
    startedAt: '15 Aug 2026, 02:10',
    minutesAgo: 1_450,
    attempts: [attemptOf(59, 1)],
  }),
  run({
    ...shared,
    id: 'run-4450',
    verdict: 'timedOut',
    trigger: 'ci',
    by: 'CI · main',
    branch: 'main',
    commit: '7c02e15',
    startedAt: '14 Aug 2026, 19:22',
    minutesAgo: 2_900,
    attempts: [
      attemptOf(67, 1, {
        index: 1,
        ms: 30_000,
        error: 'TimeoutError: page.goto: Timeout 30000ms exceeded.',
      }),
    ],
  }),
];
