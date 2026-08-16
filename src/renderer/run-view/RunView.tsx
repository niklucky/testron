import { useEffect, useMemo, useState } from 'react';

import { Badge, Button, Icon, IconButton, Meter, StatCard, Trend, useTheme } from '../design';
import { age, ms } from '../dashboard/format';
import { board } from '../test-view/data';
import { Evidence } from './Evidence';
import { runs, steps } from './data';
import { RunRail, verdictTone } from './RunRail';
import { Waterfall } from './Waterfall';

/**
 * One run, in full.
 *
 * Triage answers "why does this keep failing" across runs; this screen answers
 * "what happened in *this* one" — the order, the cost, and everything the
 * runner kept. The three regions are the three questions in the order they get
 * asked: which run, what did it do, what did it leave behind.
 *
 * The step list is the test's own, flattened the same way the spec is
 * generated, so the report can only ever describe steps the test actually has.
 *
 * Shell only. main/replay/runner.ts already produces per-step durations, page
 * URLs, the error, a trace and a failure screenshot; console output, video and
 * retries are marked in the UI as not captured, because they are not.
 */
export const RunView = () => {
  const { theme, toggle } = useTheme();
  const [selectedId, setSelectedId] = useState(runs[0].id);
  const [filter, setFilter] = useState<'all' | 'failed'>('all');
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [expanded, setExpanded] = useState<number>();
  const [log, setLog] = useState('Report · run-4471 failed on Staging');

  useEffect(() => {
    window.testron?.command({ type: 'set-shell-route', route: 'dashboard' });
  }, []);

  const run = runs.find((entry) => entry.id === selectedId) ?? runs[0];

  useEffect(() => {
    setAttemptNumber(run.attempts.length);
    setExpanded(undefined);
  }, [run.id, run.attempts.length]);

  const attempt = run.attempts.find((entry) => entry.number === attemptNumber) ?? run.attempts[0];

  /** The last green run before this one — the only honest baseline. */
  const baseline = useMemo(() => {
    const index = runs.findIndex((entry) => entry.id === run.id);
    return runs
      .slice(index + 1)
      .find((entry) => entry.verdict === 'passed')
      ?.attempts.at(-1);
  }, [run.id]);

  const failing = attempt.steps.find((result) => result.status === 'failed');
  const failingStep = failing ? steps[failing.index] : undefined;
  const verdict = verdictTone[run.verdict];
  const slowest = attempt.steps.reduce(
    (worst, result) => (result.ms > worst.ms ? result : worst),
    attempt.steps[0],
  );
  const drift = baseline ? ((attempt.ms - baseline.ms) / baseline.ms) * 100 : undefined;

  return (
    <main className="ui-root flex h-screen w-screen flex-col overflow-hidden bg-plane font-sans text-ink antialiased">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3 [-webkit-app-region:drag]">
        <div className="w-[74px] shrink-0" />
        <div className="flex min-w-0 items-center gap-1.5 [-webkit-app-region:no-drag]">
          <IconButton
            icon="arrowLeft"
            size="sm"
            label="Back to the test"
            onClick={() => {
              window.location.hash = '#/test';
            }}
          />
          <Button variant="ghost" size="sm" iconEnd="caret">
            {board.detail.suite}
          </Button>
          <Icon name="chevron" size={12} className="shrink-0 text-ink-3" />
          <a href="#/test" className="min-w-0 truncate px-1.5 text-md text-ink no-underline">
            {board.detail.name}
          </a>
          <Icon name="chevron" size={12} className="shrink-0 text-ink-3" />
          <span className="ui-mono px-1.5 text-md text-ink-2">{run.id}</span>
          <Badge tone={verdict.tone} icon={run.verdict === 'passed' ? 'check' : 'alert'}>
            {verdict.label}
          </Badge>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 [-webkit-app-region:no-drag]">
          <span className="text-sm text-ink-3">
            {run.trigger === 'ci' ? 'CI' : run.trigger === 'schedule' ? 'Scheduled' : 'Manual'} ·{' '}
            {age(run.minutesAgo)} ago
          </span>
          <IconButton
            icon={theme === 'dark' ? 'sun' : 'moon'}
            size="sm"
            label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            onClick={toggle}
          />
        </div>
      </header>

      <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line px-3">
        <Button
          variant="primary"
          icon="rerun"
          onClick={() => setLog(`Re-run queued on ${run.environment}`)}
        >
          Re-run
        </Button>
        <Button icon="history" onClick={() => setLog(`Trace opened · runs/${run.id}/trace.zip`)}>
          Open trace
        </Button>
        <Button icon="copy" onClick={() => setLog('Artifacts exported to ~/Downloads')}>
          Export artifacts
        </Button>
        <span className="mx-1 h-5 w-px bg-line" />
        <Button icon="bug" onClick={() => setLog(`Bug drafted · ${run.id} → tracker`)}>
          File bug
        </Button>
        <Button
          icon="shield"
          onClick={() => setLog('Quarantined · this test will not block the pipeline')}
        >
          Quarantine
        </Button>

        <span className="ml-auto flex items-center gap-2 text-sm text-ink-3">
          <Badge>{run.environment}</Badge>
          <Badge>{run.browser}</Badge>
          <span className="ui-mono">
            {run.branch} · {run.commit}
          </span>
        </span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[276px_minmax(0,1fr)_324px]">
        <RunRail
          runs={runs}
          selectedId={run.id}
          filter={filter}
          onFilter={setFilter}
          onSelect={(id) => {
            setSelectedId(id);
            setLog(`Report · ${id}`);
          }}
        />

        <div className="ui-scroll min-h-0 space-y-4 overflow-y-auto px-4 py-4">
          {/* The verdict, said once, with the one action it implies. */}
          {failing && failingStep ? (
            <section className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-start gap-3">
                <Badge tone="critical" icon="alert" className="mt-0.5">
                  Failed
                </Badge>
                <div className="min-w-0 flex-1">
                  <h1 className="text-lg font-semibold">
                    Step {failing.index + 1} timed out after {ms(failing.ms)}
                  </h1>
                  <p className="ui-mono mt-1 truncate text-base text-ink-2">
                    {failingStep.locator || failingStep.label}
                  </p>
                  <p className="mt-1.5 text-base text-ink-3">
                    {run.attempts.length > 1
                      ? 'Attempt 1 failed and attempt 2 passed on the same commit — this is flaky, not broken.'
                      : 'The button stayed disabled; the payment intent request returned 502.'}
                  </p>
                </div>
                <Button
                  icon="history"
                  onClick={() => setLog(`Trace opened at step ${failing.index + 1}`)}
                >
                  Trace at step {failing.index + 1}
                </Button>
              </div>
            </section>
          ) : (
            <section className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
              <Badge tone="good" icon="check">
                Passed
              </Badge>
              <p className="text-base text-ink-2">
                All {attempt.steps.length} steps passed in {ms(attempt.ms)}.
              </p>
            </section>
          )}

          <div className="grid grid-cols-3 gap-3">
            <StatCard
              icon="clock"
              label="Duration"
              value={ms(attempt.ms)}
              delta={drift === undefined ? undefined : <Trend value={drift} unit="%" goodDown />}
              foot={baseline ? `Last green run took ${ms(baseline.ms)}` : 'No green run to compare'}
            />
            <StatCard
              icon="steps"
              label="Steps"
              value={`${attempt.steps.filter((result) => result.status === 'passed').length}/${attempt.steps.length}`}
              foot={
                <span className="block">
                  <Meter
                    className="mt-1"
                    height={4}
                    value={
                      attempt.steps.filter((result) => result.status === 'passed').length /
                      attempt.steps.length
                    }
                    tone={failing ? 'critical' : 'good'}
                    label="Steps completed"
                  />
                </span>
              }
            />
            <StatCard
              icon="alert"
              label="Slowest step"
              value={ms(slowest?.ms ?? 0)}
              foot={`Step ${(slowest?.index ?? 0) + 1} · ${(((slowest?.ms ?? 0) / attempt.ms) * 100).toFixed(0)}% of the run`}
            />
          </div>

          <Waterfall
            steps={steps}
            attempt={attempt}
            attempts={run.attempts}
            attemptNumber={attempt.number}
            onAttempt={(number) => {
              setAttemptNumber(number);
              setLog(`Attempt ${number}`);
            }}
            baseline={baseline}
            expanded={expanded}
            onExpand={setExpanded}
          />
        </div>

        <Evidence run={run} failingLabel={failingStep?.label} onLog={setLog} />
      </div>

      <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-line px-3 text-sm text-ink-3">
        <span className="ui-mono truncate text-ink-2">runs/{run.id}/</span>
        <span className="truncate">{log}</span>
        <span className="ml-auto flex shrink-0 items-center gap-3">
          <span>{run.attempts.length === 1 ? '1 attempt' : `${run.attempts.length} attempts`}</span>
          <span>{run.artifacts.filter((artifact) => artifact.captured).length} artifacts</span>
          <a href="#/test" className="text-ink-3 no-underline hover:text-ink">
            Back to test
          </a>
        </span>
      </footer>
    </main>
  );
};
