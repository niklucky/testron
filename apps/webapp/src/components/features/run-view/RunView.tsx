import { useTranslation } from '@warpunit/slang-react';
import { useEffect, useMemo, useState } from 'react';

import { Badge, Button, Icon, IconButton, Meter, StatCard, Trend, useTheme } from '../../ui/design';
import { age, ms } from '../dashboard/format';
import { board } from '../test-view/data';
import { Evidence } from './Evidence';
import { runs, steps } from './data';
import { RunRail, verdictTone } from './RunRail';
import { Waterfall } from './Waterfall';
import { goToDashboard } from '../../../lib/navigation';

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
  const { t } = useTranslation();
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
            label={t('back_to_the_test')}
            onClick={() => {
              goToDashboard();
            }}
          />
          <Button variant="ghost" size="sm" iconEnd="caret">
            {board.detail.suite}
          </Button>
          <Icon name="chevron" size={12} className="shrink-0 text-ink-3" />
          <a href="#/test" className="min-w-0 truncate px-1.5 text-ink no-underline">
            {board.detail.name}
          </a>
          <Icon name="chevron" size={12} className="shrink-0 text-ink-3" />
          <span className="ui-mono px-1.5 text-ink-2">{run.id}</span>
          <Badge tone={verdict.tone} icon={run.verdict === 'passed' ? 'check' : 'alert'}>
            {t(verdict.label)}
          </Badge>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 [-webkit-app-region:no-drag]">
          <span className="text-ink-3">
            {run.trigger === 'ci'
              ? t('ci')
              : run.trigger === 'schedule'
                ? t('scheduled')
                : t('manual')}{' '}
            · {age(run.minutesAgo)} {t('ago')}
          </span>
          <IconButton
            icon={theme === 'dark' ? 'sun' : 'moon'}
            size="sm"
            label={theme === 'dark' ? t('switch_to_light') : t('switch_to_dark')}
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
          {t('re_run')}
        </Button>
        <Button icon="history" onClick={() => setLog(`Trace opened · runs/${run.id}/trace.zip`)}>
          {t('open_trace')}
        </Button>
        <Button icon="copy" onClick={() => setLog('Artifacts exported to ~/Downloads')}>
          {t('export_artifacts')}
        </Button>
        <span className="mx-1 h-5 w-px bg-line" />
        <Button icon="bug" onClick={() => setLog(`Bug drafted · ${run.id} → tracker`)}>
          {t('file_bug')}
        </Button>
        <Button
          icon="shield"
          onClick={() => setLog('Quarantined · this test will not block the pipeline')}
        >
          {t('quarantine')}
        </Button>

        <span className="ml-auto flex items-center gap-2 text-ink-3">
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
                  {t('failed_2')}
                </Badge>
                <div className="min-w-0 flex-1">
                  <h1 className="text-lg font-semibold">
                    {t('step_2')} {failing.index + 1} {t('timed_out_after')} {ms(failing.ms)}
                  </h1>
                  <p className="ui-mono mt-1 truncate text-ink-2">
                    {failingStep.locator || failingStep.label}
                  </p>
                  <p className="mt-1.5 text-ink-3">
                    {run.attempts.length > 1
                      ? t('attempt_1_failed_and_attempt_2_passed_on_the_same_commit_this_is')
                      : t('the_button_stayed_disabled_the_payment_intent_request_returned_5')}
                  </p>
                </div>
                <Button
                  icon="history"
                  onClick={() => setLog(`Trace opened at step ${failing.index + 1}`)}
                >
                  {t('trace_at_step')} {failing.index + 1}
                </Button>
              </div>
            </section>
          ) : (
            <section className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
              <Badge tone="good" icon="check">
                {t('passed')}
              </Badge>
              <p className="text-ink-2">
                {t('all')} {attempt.steps.length} {t('steps_passed_in')} {ms(attempt.ms)}.
              </p>
            </section>
          )}

          <div className="grid grid-cols-3 gap-3">
            <StatCard
              icon="clock"
              label={t('duration')}
              value={ms(attempt.ms)}
              delta={drift === undefined ? undefined : <Trend value={drift} unit="%" goodDown />}
              foot={
                baseline ? `Last green run took ${ms(baseline.ms)}` : t('no_green_run_to_compare')
              }
            />
            <StatCard
              icon="steps"
              label={t('steps_2')}
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
                    label={t('steps_completed')}
                  />
                </span>
              }
            />
            <StatCard
              icon="alert"
              label={t('slowest_step')}
              value={ms(slowest?.ms ?? 0)}
              foot={t('step_of_the_run', {
                value1: (slowest?.index ?? 0) + 1,
                value2: (((slowest?.ms ?? 0) / attempt.ms) * 100).toFixed(0),
              })}
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

      <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-line px-3 text-ink-3">
        <span className="ui-mono truncate text-ink-2">
          {t('runs_4')}
          {run.id}/
        </span>
        <span className="truncate">{log}</span>
        <span className="ml-auto flex shrink-0 items-center gap-3">
          <span>{t('attempts_count', { count: run.attempts.length })}</span>
          <span>
            {run.artifacts.filter((artifact) => artifact.captured).length} {t('artifacts_2')}
          </span>
          <a href="#/test" className="text-ink-3 no-underline hover:text-ink">
            {t('back_to_test')}
          </a>
        </span>
      </footer>
    </main>
  );
};
