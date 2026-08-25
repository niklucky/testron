import { buildSuites, days, failures } from './data';
import type { RunVerdict } from './types';

/**
 * Project-wide run history.
 *
 * The dashboard's other views are about *state* — which suites are healthy,
 * which failures are open. This one is about *events*: every execution of
 * every test, in the order they happened. It is generated from the same suites
 * and failures the rest of the shell uses, so a test that is failing in the
 * tree is failing here too.
 *
 * Deterministic, like the rest of ./data: the same numbers on every reload.
 * Replace with the runs table when one exists — the runner writes artifacts to
 * runs/<testId>/<timestamp> today but keeps no index of them.
 */

export type Trigger = 'manual' | 'ci' | 'schedule';

/** A run that has not finished is still a run, and belongs at the top. */
export type ProjectRunVerdict = RunVerdict | 'running';

export type ProjectRun = {
  id: string;
  testId: string;
  test: string;
  suite: string;
  verdict: ProjectRunVerdict;
  environment: string;
  browser: string;
  branch: string;
  commit: string;
  trigger: Trigger;
  by: string;
  minutesAgo: number;
  seconds: number;
  attempts: number;
  steps: number;
  /** Set on failures — the same signature Triage groups by. */
  signature?: string;
  failedStep?: number;
};

const mulberry32 = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

export const environments = ['Production', 'Staging', 'Preview', 'Local'];

const triggers: { trigger: Trigger; by: string; weight: number }[] = [
  { trigger: 'ci', by: 'CI · main', weight: 0.5 },
  { trigger: 'schedule', by: 'Nightly', weight: 0.28 },
  { trigger: 'manual', by: 'Nikita S.', weight: 0.22 },
];

const branches = [
  { branch: 'main', commit: '9f3c1ab' },
  { branch: 'main', commit: '7c02e15' },
  { branch: 'feat/express-delivery', commit: '2b70d4e' },
  { branch: 'fix/cart-totals', commit: 'c41a980' },
];

const MINUTES_PER_DAY = 1_440;

export const runs: ProjectRun[] = (() => {
  const random = mulberry32(90_210);
  const suites = buildSuites();
  const tests = suites.flatMap((suite) =>
    suite.tests.map((test) => ({
      testId: test.id,
      suite: suite.name,
      test: test.name,
      status: test.status,
    })),
  );

  const history: ProjectRun[] = [];
  // Fourteen days back, a handful of runs each day, weekends quieter.
  for (let day = 0; day < 14; day += 1) {
    const weekendish = day % 7 === 5 || day % 7 === 6;
    const count = Math.round((5 + random() * 5) * (weekendish ? 0.4 : 1));
    for (let index = 0; index < count; index += 1) {
      const subject = tests[Math.floor(random() * tests.length)];
      const failure = failures.find((entry) => entry.test === subject.test);
      const roll = random();
      const verdict: ProjectRunVerdict =
        subject.status === 'failed' && roll < 0.55
          ? 'failed'
          : roll < 0.08
            ? 'flaky'
            : roll < 0.12
              ? 'skipped'
              : 'passed';
      const trigger = triggers.find((entry) => random() < entry.weight) ?? triggers[0];
      const source = branches[Math.floor(random() * branches.length)];
      const steps = 6 + Math.floor(random() * 9);

      history.push({
        id: `run-${4_400 + history.length}`,
        testId: subject.testId,
        test: subject.test,
        suite: subject.suite,
        verdict,
        environment:
          trigger.trigger === 'schedule'
            ? 'Staging'
            : environments[Math.floor(random() * environments.length)],
        browser: random() < 0.8 ? 'Chromium 141' : 'WebKit 18',
        branch: source.branch,
        commit: source.commit,
        trigger: trigger.trigger,
        by: trigger.by,
        minutesAgo: Math.round(day * MINUTES_PER_DAY + 60 + random() * (MINUTES_PER_DAY - 120)),
        seconds: Number((6 + random() * 40).toFixed(1)),
        attempts: verdict === 'flaky' ? 2 : 1,
        steps,
        ...(verdict === 'failed'
          ? {
              signature: failure?.signature ?? 'AssertionError · toBeVisible',
              failedStep: 1 + Math.floor(random() * steps),
            }
          : {}),
      });
    }
  }

  // Whatever is in flight sits at the top, still counting.
  const live: ProjectRun[] = tests.slice(0, 3).map((subject, index) => ({
    id: `run-${4_500 + index}`,
    testId: subject.testId,
    test: subject.test,
    suite: subject.suite,
    verdict: 'running',
    environment: 'Staging',
    browser: 'Chromium 141',
    branch: 'main',
    commit: '9f3c1ab',
    trigger: 'ci',
    by: 'CI · main',
    minutesAgo: index,
    seconds: 4 + index * 3,
    attempts: 1,
    steps: 9,
  }));

  return [...live, ...history].sort((a, b) => a.minutesAgo - b.minutesAgo);
})();

/** Which day bucket a run belongs to, counting back from today. */
export const dayIndexOf = (run: ProjectRun) => Math.floor(run.minutesAgo / MINUTES_PER_DAY);

export const dayLabel = (index: number) => {
  if (index === 0) return 'Today';
  if (index === 1) return 'Yesterday';
  const day = days.at(-1 - index);
  if (!day) return `${index}d ago`;
  return new Date(day.key).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

/** Failures per suite per day, for the reliability heat map. */
export const failureGrid = (window: ProjectRun[], range: number) => {
  const suites = [...new Set(window.map((run) => run.suite))];
  return suites.map((suite) => ({
    id: suite,
    label: suite,
    values: Array.from({ length: range }, (_, column) => {
      const day = range - 1 - column;
      return window.filter(
        (run) => run.suite === suite && dayIndexOf(run) === day && run.verdict === 'failed',
      ).length;
    }),
  }));
};

/** Pass rate, median duration and flakiness for a set of runs. */
export const summarize = (window: ProjectRun[]) => {
  const finished = window.filter((run) => run.verdict !== 'running' && run.verdict !== 'skipped');
  const passed = finished.filter((run) => run.verdict === 'passed').length;
  const durations = [...finished].map((run) => run.seconds).sort((a, b) => a - b);
  return {
    total: window.length,
    passed,
    failed: finished.filter((run) => run.verdict === 'failed').length,
    flaky: finished.filter((run) => run.verdict === 'flaky').length,
    running: window.filter((run) => run.verdict === 'running').length,
    passRate: (passed / Math.max(1, finished.length)) * 100,
    median: durations[Math.floor(durations.length / 2)] ?? 0,
  };
};

/** Per-test reliability, worst first — the rail's leaderboard. */
export const byTest = (window: ProjectRun[]) => {
  const tests = [...new Set(window.map((run) => run.test))];
  return tests
    .map((test) => {
      const entries = window.filter((run) => run.test === test && run.verdict !== 'running');
      const passed = entries.filter((run) => run.verdict === 'passed').length;
      const flaky = entries.filter((run) => run.verdict === 'flaky').length;
      return {
        test,
        suite: entries[0]?.suite ?? '',
        runs: entries.length,
        flaky,
        passRate: (passed / Math.max(1, entries.length)) * 100,
        slowest: Math.max(...entries.map((run) => run.seconds), 0),
        recent: [...entries]
          .sort((a, b) => b.minutesAgo - a.minutesAgo)
          .slice(-8)
          .map((run) => run.verdict),
      };
    })
    .filter((entry) => entry.runs > 1);
};

/** Failure signatures across the window, most frequent first. */
export const signatures = (window: ProjectRun[]) => {
  const grouped = new Map<string, { signature: string; count: number; lastSeen: number }>();
  for (const run of window) {
    if (!run.signature) continue;
    const entry = grouped.get(run.signature);
    if (entry) {
      entry.count += 1;
      entry.lastSeen = Math.min(entry.lastSeen, run.minutesAgo);
    } else
      grouped.set(run.signature, { signature: run.signature, count: 1, lastSeen: run.minutesAgo });
  }
  return [...grouped.values()].sort((a, b) => b.count - a.count);
};
