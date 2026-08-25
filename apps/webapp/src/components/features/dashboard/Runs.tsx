import { useTranslation } from '@warpunit/slang-react';
import { useMemo } from 'react';

import { goToTest } from '../../../lib/navigation';
import {
  Badge,
  EmptyState,
  HeatMap,
  Icon,
  Panel,
  PanelHeader,
  PulseDot,
  SearchField,
  SegmentedControl,
  StatCard,
  StatusDot,
  Trend,
  type Tone,
} from '../../ui/design';
import { age, ms } from './format';
import type { ProjectRun, ProjectRunVerdict } from './runHistory';
import { dayIndexOf, dayLabel, failureGrid, summarize } from './runHistory';
import { verdictTone } from './tone';

export type RunsState = {
  range: number;
  environment: string;
  verdict: 'all' | 'failed' | 'flaky';
  query: string;
};

export const initialRunsState: RunsState = {
  range: 14,
  environment: 'all',
  verdict: 'all',
  query: '',
};

const ranges = [
  { id: '7', label: '7d' },
  { id: '14', label: '14d' },
];

const verdicts = [
  { id: 'all', label: 'All' },
  { id: 'failed', label: 'Failed' },
  { id: 'flaky', label: 'Flaky' },
];

const runTone: Record<ProjectRunVerdict, { tone: Tone; label: string }> = {
  ...verdictTone,
  running: { tone: 'accent', label: 'Running' },
};

const columns =
  'grid-cols-[16px_minmax(0,2fr)_minmax(0,0.75fr)_minmax(0,0.85fr)_58px_66px] items-center gap-2.5';

/**
 * Every run in the project, newest first.
 *
 * Overview asks how the suites are doing and Triage asks what is broken; this
 * asks what actually ran. It is the only view where an individual execution is
 * the row — which is why the table carries where it ran and off which commit,
 * the two things that turn "it failed" into something reproducible.
 */
export const Runs = ({
  runs,
  state,
  onState,
  onLog,
}: {
  runs: ProjectRun[];
  state: RunsState;
  onState: (state: RunsState) => void;
  onLog: (message: string) => void;
}) => {
  const { t } = useTranslation();
  const { range, environment, verdict, query } = state;
  const patch = (next: Partial<RunsState>) => onState({ ...state, ...next });
  const environments = useMemo(
    () => [...new Set(runs.map((run) => run.environment))].sort(),
    [runs],
  );

  const period = useMemo(() => runs.filter((run) => dayIndexOf(run) < range), [runs, range]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return period.filter((run) => {
      if (environment !== 'all' && run.environment !== environment) return false;
      if (verdict === 'failed' && run.verdict !== 'failed') return false;
      if (verdict === 'flaky' && run.verdict !== 'flaky') return false;
      if (!needle) return true;
      return `${run.test} ${run.suite} ${run.environment} ${run.branch} ${run.commit} ${run.signature ?? ''}`
        .toLowerCase()
        .includes(needle);
    });
  }, [period, environment, verdict, query]);

  const now = summarize(period);
  const earlier = runs.filter((run) => dayIndexOf(run) >= range && dayIndexOf(run) < range * 2);
  const before = summarize(earlier);
  /**
   * History only goes back fourteen days, so at the widest range there is
   * nothing to compare against. A delta measured from an empty window is a
   * fabrication — better to show no delta and say why.
   */
  const comparable = earlier.length > 0;

  const grid = useMemo(() => failureGrid(period, range), [period, range]);

  const openRun = (run: ProjectRun) => {
    onLog(`Opening test · ${run.test}`);
    window.testron?.command({ type: 'select-test', testId: run.testId });
    goToTest(run.testId);
  };

  /** Rows are grouped by day, so the table reads as a log rather than a list. */
  const groups = useMemo(() => {
    const buckets = new Map<number, ProjectRun[]>();
    for (const run of rows) {
      const day = dayIndexOf(run);
      buckets.set(day, [...(buckets.get(day) ?? []), run]);
    }
    return [...buckets.entries()].sort(([a], [b]) => a - b);
  }, [rows]);

  return (
    <section className="ui-scroll min-h-0 overflow-y-auto bg-surface px-5 py-4">
      <div className="mb-4 flex items-center gap-2">
        <h1 className="text-xl font-semibold">{t('run_history')}</h1>
        {now.running > 0 && (
          <span className="flex items-center gap-1.5 rounded-md border border-line bg-plane px-2 py-1">
            <PulseDot label={t('runs_in_flight')} />
            <span className="text-ink-2">
              {now.running} {t('in_flight')}
            </span>
          </span>
        )}
        <SegmentedControl
          className="ml-auto"
          label={t('range')}
          items={ranges}
          value={String(range)}
          onChange={(value) => patch({ range: Number(value) })}
        />
      </div>

      <div className="mb-4 grid grid-cols-4 gap-3">
        <StatCard
          icon="history"
          label={t('runs')}
          value={now.total}
          foot={t('failed_flaky', { value1: now.failed, value2: now.flaky })}
        />
        <StatCard
          icon="check"
          label={t('pass_rate')}
          value={`${now.passRate.toFixed(1)}%`}
          delta={
            comparable ? <Trend value={now.passRate - before.passRate} unit="pt" /> : undefined
          }
          foot={
            comparable
              ? t('previous_days_rate', { days: range, rate: before.passRate.toFixed(1) })
              : t('green_runs_ratio', {
                  passed: now.passed,
                  total: now.total - now.running - now.flaky,
                })
          }
        />
        <StatCard
          icon="clock"
          label={t('median_duration')}
          value={ms(now.median * 1000)}
          delta={
            comparable ? <Trend value={now.median - before.median} unit="s" goodDown /> : undefined
          }
          foot={t('across_finished_runs', { value1: now.total - now.running })}
        />
        <StatCard
          icon="alert"
          label={t('flaky_runs')}
          value={now.flaky}
          foot={t('of_everything_that_ran', {
            value1: ((now.flaky / Math.max(1, now.total)) * 100).toFixed(1),
          })}
        />
      </div>

      <Panel className="mb-4 p-4">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-md font-semibold">{t('failures_by_suite')}</h2>
          <span className="text-ink-3">
            {t('last')} {range} {t('days')}
          </span>
        </div>
        {/* One row per suite, one cell per day: where the breakage clusters. */}
        <HeatMap
          rows={grid}
          thresholds={[2, 3, 5]}
          cellLabel={(row, value, index) =>
            `${row.label} · ${dayLabel(range - 1 - index)} · ${value} failed`
          }
          legendLabels={['none', '1', '2', '3–4', '5+']}
          meta={
            <span className="text-ink-3">
              {range} {t('days')}
            </span>
          }
        />
      </Panel>

      <Panel>
        <PanelHeader
          title={t('runs')}
          subtitle={t('of_in_the_last_days', {
            value1: rows.length,
            value2: period.length,
            value3: range,
          })}
        />

        {/* The filters get their own row rather than the header's right edge:
            three controls and a search box never fit next to a title, and this
            is the one view where filtering *is* the work. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2">
          <SegmentedControl
            label={t('verdict')}
            variant="pill"
            items={verdicts}
            value={verdict}
            onChange={(value) => patch({ verdict: value as RunsState['verdict'] })}
          />
          <span className="h-4 w-px bg-line" />
          <SegmentedControl
            label={t('environment')}
            variant="pill"
            items={[
              { id: 'all', label: 'All envs' },
              ...environments.map((name) => ({ id: name, label: name })),
            ]}
            value={environment}
            onChange={(value) => patch({ environment: value })}
          />
          <SearchField
            label={t('filter_runs')}
            placeholder={t('test_branch_signature')}
            size="sm"
            className="ml-auto w-[180px]"
            value={query}
            onChange={(event) => patch({ query: event.target.value })}
          />
        </div>

        <div
          className={`grid ${columns} border-b border-line-soft px-4 py-2 font-bold uppercase tracking-[0.09em] text-ink-3 text-sm`}
        >
          <span />
          <span>{t('test')}</span>
          <span>{t('trigger')}</span>
          <span>{t('commit')}</span>
          <span className="text-right">{t('duration')}</span>
          <span className="text-right">{t('when')}</span>
        </div>

        {rows.length === 0 && <EmptyState>{t('no_run_matches_this_filter')}</EmptyState>}

        {groups.map(([day, entries]) => (
          <div key={day}>
            <p className="flex items-center gap-2 border-b border-line-soft bg-plane/40 px-4 py-1.5 text-ink-3">
              <span className="font-semibold text-ink-2">{dayLabel(day)}</span>
              <span>
                {entries.length} {t('runs_2')}{' '}
                {entries.filter((run) => run.verdict === 'failed').length} {t('failed')}
              </span>
            </p>

            {entries.map((run) => {
              const tone = runTone[run.verdict];
              return (
                <div
                  key={run.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openRun(run)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') openRun(run);
                  }}
                  className={`grid ${columns} cursor-default border-b border-line-soft px-4 py-2 last:border-b-0 hover:bg-raised/60`}
                >
                  {run.verdict === 'running' ? (
                    <PulseDot tone="accent" label={t('running')} />
                  ) : (
                    <StatusDot tone={tone.tone} label={tone.label} />
                  )}

                  {/* Where it ran belongs next to what ran: a green run on
                      Local and a green run on Production are not the same
                      news, and the eye should not have to travel for it. */}
                  <span className="flex min-w-0 items-center gap-2">
                    <Badge size="sm">{run.environment}</Badge>
                    <span className="min-w-0 flex-1 truncate ">{run.test}</span>
                    {run.attempts > 1 && (
                      <Badge size="sm" tone="warning">
                        {run.attempts} {t('attempts')}
                      </Badge>
                    )}
                    {/* Both the name and the signature give ground as the
                        column narrows; neither is allowed to run over the
                        other. */}
                    {run.signature && (
                      <span className="ui-mono min-w-0 max-w-[45%] shrink truncate text-ink-3">
                        {run.signature}
                      </span>
                    )}
                  </span>

                  <span className="flex min-w-0 items-center gap-1.5 text-ink-3">
                    <Icon
                      name={
                        run.trigger === 'ci'
                          ? 'rerun'
                          : run.trigger === 'schedule'
                            ? 'clock'
                            : 'play'
                      }
                      size={12}
                    />
                    <span className="truncate">{run.by}</span>
                  </span>

                  <span className="ui-mono truncate text-ink-3">
                    {run.branch} · {run.commit}
                  </span>

                  <span className="ui-mono text-right text-ink-2">
                    {run.verdict === 'running' ? '…' : `${run.seconds.toFixed(1)}s`}
                  </span>

                  <span className="ui-mono text-right text-ink-3">
                    {age(run.minutesAgo)} {t('ago')}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </Panel>
    </section>
  );
};
