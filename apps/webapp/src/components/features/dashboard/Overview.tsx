import { useTranslation } from '@warpunit/slang-react';
import { useMemo } from 'react';
import type { ProjectActivity } from '@testron/protocol';

import {
  Badge,
  Button,
  EmptyState,
  Icon,
  Legend,
  Panel,
  PanelHeader,
  SearchField,
  SegmentedControl,
  SplitBar,
  StackedBars,
  StatCard,
  StatusDot,
  toneInk,
  Trend,
  type StackedDatum,
} from '../../ui/design';
import { activity, days, passRateOf, tally } from './data';
import { presentProjectActivity } from './activity';
import { age, ms } from './format';
import type { LiveOverview } from './overview-data';
import { activityTone, healthSplits, runLegend, runSeries, verdictTone } from './tone';
import type { Sort, SortKey, SuiteRecord, Totals } from './types';

export type OverviewState = {
  range: number;
  query: string;
  onlyAttention: boolean;
  sort: Sort;
};

export const initialOverviewState: OverviewState = {
  range: 14,
  query: '',
  onlyAttention: false,
  sort: { key: 'lastRun', direction: 'asc' },
};

const ranges = [
  { id: '7', label: '7d' },
  { id: '14', label: '14d' },
  { id: '30', label: '30d' },
];

/** One grid definition, shared by the header row and every body row. */
const columns =
  'grid-cols-[minmax(0,1.8fr)_54px_minmax(96px,0.85fr)_92px_minmax(0,0.8fr)_20px] items-center gap-2.5';

/**
 * The project at a glance: four numbers, a volume chart, and the two lists
 * people actually act on — suites that need attention, and what changed.
 */
export const Overview = ({
  suites,
  totals,
  live,
  dataStatus = 'local',
  errorMessage,
  recentActivity = [],
  expandedSuiteIds,
  state,
  onState,
  onToggleSuite,
  onEditSuite,
  onOpenTest,
  onLog,
}: {
  suites: SuiteRecord[];
  totals: Totals;
  live?: LiveOverview;
  dataStatus?: 'local' | 'loading' | 'live' | 'error';
  errorMessage?: string;
  recentActivity?: ProjectActivity[];
  expandedSuiteIds: string[];
  state: OverviewState;
  onState: (state: OverviewState) => void;
  onToggleSuite: (suiteId: string) => void;
  onEditSuite: (suite: SuiteRecord) => void;
  onOpenTest: (test: SuiteRecord['tests'][number]) => void;
  onLog: (message: string) => void;
}) => {
  const { t } = useTranslation();
  const { range, query, onlyAttention, sort } = state;
  const patch = (next: Partial<OverviewState>) => onState({ ...state, ...next });
  const liveActivity = useMemo(() => presentProjectActivity(recentActivity), [recentActivity]);

  const shownTotals = live?.totals ?? totals;
  const passRate = live
    ? live.passRate
    : (shownTotals.passed / Math.max(1, shownTotals.passed + shownTotals.failed)) * 100;
  const sourceDays = live?.days ?? days;
  const runs =
    live?.runs ?? sourceDays.reduce((sum, day) => sum + day.passed + day.skipped + day.failed, 0);
  const lastRunMinutesAgo = live
    ? live.lastRunMinutesAgo
    : suites.length === 0
      ? null
      : (suites
          .map((suite) => suite.lastRunMinutesAgo)
          .filter((value) => value !== null)
          .sort((a, b) => a - b)[0] ?? null);
  const chart: StackedDatum[] = sourceDays.slice(-range).map((day) => ({
    key: day.key,
    label: `${day.weekday} ${day.dayOfMonth}`,
    tick: String(day.dayOfMonth),
    values: { passed: day.passed, skipped: day.skipped, failed: day.failed },
  }));

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = suites.filter((suite) => {
      if (onlyAttention && tally(suite).failed === 0) return false;
      if (!needle) return true;
      return (
        suite.name.toLowerCase().includes(needle) ||
        suite.owner.toLowerCase().includes(needle) ||
        suite.tests.some((test) => test.name.toLowerCase().includes(needle))
      );
    });
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case 'name':
          return a.name.localeCompare(b.name) * factor;
        case 'tests':
          return (a.tests.length - b.tests.length) * factor;
        case 'passRate':
          return (passRateOf(a) - passRateOf(b)) * factor;
        default:
          return (
            ((a.lastRunMinutesAgo ?? Number.POSITIVE_INFINITY) -
              (b.lastRunMinutesAgo ?? Number.POSITIVE_INFINITY)) *
            factor
          );
      }
    });
  }, [suites, query, onlyAttention, sort]);

  if (dataStatus === 'loading' || dataStatus === 'error')
    return (
      <div className="min-h-0 overflow-y-auto p-5">
        <Panel>
          <PanelHeader
            title={
              dataStatus === 'loading' ? t('loading_project_overview') : t('overview_unavailable')
            }
            subtitle={
              dataStatus === 'loading'
                ? t('fetching_the_selected_project_snapshot')
                : (errorMessage ?? t('the_server_workspace_could_not_be_loaded'))
            }
          />
          <EmptyState>
            {dataStatus === 'loading'
              ? t('summary_values_will_appear_when_the_workspace_finishes_loading')
              : t('check_the_server_connection_and_refresh_the_workspace')}
          </EmptyState>
        </Panel>
      </div>
    );

  const SortHead = ({ label, sortKey }: { label: string; sortKey: SortKey }) => (
    <button
      type="button"
      className={`flex items-center gap-1 whitespace-nowrap text-2xs font-bold uppercase tracking-[0.09em] transition-colors ${
        sort.key === sortKey ? 'text-ink-2' : 'text-ink-3'
      }`}
      onClick={() =>
        patch({
          sort:
            sort.key === sortKey
              ? { key: sortKey, direction: sort.direction === 'asc' ? 'desc' : 'asc' }
              : { key: sortKey, direction: sortKey === 'name' ? 'asc' : 'desc' },
        })
      }
    >
      {label}
      <Icon
        name="caret"
        size={11}
        className={`transition-transform ${sort.key === sortKey ? '' : 'opacity-0'} ${
          sort.key === sortKey && sort.direction === 'asc' ? 'rotate-180' : ''
        }`}
      />
    </button>
  );

  return (
    <div className="min-h-0 overflow-y-auto">
      <div className="w-full p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">{t('project_overview')}</h1>
            <p className="mt-1 text-base text-ink-3">
              {suites.length} {t('suites')} {shownTotals.tests} {t('tests_last_run')}{' '}
              {lastRunMinutesAgo === null
                ? t('never')
                : t('ago_value', { value: age(lastRunMinutesAgo) })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SegmentedControl
              variant="solid"
              label={t('chart_range')}
              items={ranges}
              value={String(range)}
              onChange={(value) => patch({ range: Number(value) })}
            />
            <Button
              icon="play"
              onClick={() => onLog(`Queued a full run of ${shownTotals.tests} tests`)}
            >
              {t('run_all')}
            </Button>
          </div>
        </div>

        <section className="mt-4 grid grid-cols-6 gap-3 max-[1150px]:grid-cols-4 max-[820px]:grid-cols-2">
          <StatCard
            icon="test"
            label={t('total_tests')}
            value={shownTotals.tests}
            delta={dataStatus === 'local' ? <Trend value={12} digits={0} /> : undefined}
            foot={
              dataStatus === 'local'
                ? t('suites_summary_added', { count: suites.length, added: 12 })
                : t('suites_summary', { count: suites.length })
            }
          />
          <StatCard
            icon="check"
            label={t('pass_rate')}
            value={passRate === null ? '—' : `${passRate.toFixed(1)}%`}
            delta={dataStatus === 'local' ? <Trend value={2.1} unit="pts" /> : undefined}
            foot={t('passed_without_result_failed', {
              value1: shownTotals.passed,
              value2: shownTotals.skipped,
              value3: shownTotals.failed,
            })}
          />
          <StatCard
            icon="play"
            label={t('test_runs_30d')}
            value={runs.toLocaleString()}
            delta={dataStatus === 'local' ? <Trend value={18.2} unit="%" /> : undefined}
            foot={dataStatus === 'local' ? t('avg_48s_per_test_15_duration') : t('completed_runs')}
          />
          <StatCard
            icon="alert"
            label={t('needs_attention')}
            value={shownTotals.failed}
            delta={
              dataStatus === 'local' ? <Badge tone="warning">{t('3_flaky')}</Badge> : undefined
            }
            foot={t('failing_in_suites', {
              value1: suites.filter((suite) => tally(suite).failed > 0).length,
            })}
          />

          <Panel className="col-span-2 flex flex-col p-4">
            <div className="flex items-center gap-2">
              <p className="flex items-center gap-2 text-sm text-ink-3">
                <Icon name="steps" size={14} />
                {t('test_runs_last')} {range} {t('days')}
              </p>
              <Legend items={runLegend} className="ml-auto" />
            </div>
            <StackedBars data={chart} series={runSeries} compact />
          </Panel>
        </section>

        {dataStatus === 'live' && shownTotals.tests === 0 && runs === 0 && (
          <Panel className="mt-3">
            <EmptyState>{t('this_project_has_no_tests_or_runs_yet')}</EmptyState>
          </Panel>
        )}

        <section className="mt-3 grid grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] gap-3 max-[1240px]:grid-cols-1">
          <Panel className="flex min-h-0 flex-col">
            <PanelHeader
              title={t('test_suites')}
              subtitle={t('of_suites', { value1: rows.length, value2: suites.length })}
              action={
                <div className="flex items-center gap-2">
                  <SearchField
                    label={t('filter_test_suites')}
                    placeholder={t('filter_suites')}
                    className="w-[200px]"
                    value={query}
                    onChange={(event) => patch({ query: event.target.value })}
                  />
                  <Button
                    icon="alert"
                    size="sm"
                    tone="critical"
                    pressed={onlyAttention}
                    onClick={() => patch({ onlyAttention: !onlyAttention })}
                  >
                    {t('needs_attention')}
                  </Button>
                </div>
              }
            />

            <div className={`grid ${columns} border-b border-line-soft px-4 py-2`}>
              <SortHead label={t('suite')} sortKey="name" />
              <SortHead label={t('tests')} sortKey="tests" />
              <SortHead label={t('pass_rate')} sortKey="passRate" />
              <SortHead label={t('last_run')} sortKey="lastRun" />
              <span className="text-2xs font-bold uppercase tracking-[0.09em] text-ink-3">
                {t('owner')}
              </span>
              <span />
            </div>

            {rows.map((suite) => {
              const counts = tally(suite);
              const expanded = expandedSuiteIds.includes(suite.id);
              const contentId = `overview-suite-${suite.id}`;
              return (
                <div key={suite.id} className="border-b border-line-soft last:border-b-0">
                  <div
                    className={`grid w-full ${columns} px-4 py-2.5 text-left transition-colors hover:bg-raised`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <StatusDot
                        tone={
                          counts.failed > 0 ? 'critical' : counts.skipped > 0 ? 'neutral' : 'good'
                        }
                        label={
                          counts.failed > 0
                            ? t('failing_count', { count: counts.failed })
                            : counts.skipped > 0
                              ? t('some_tests_skipped')
                              : t('all_passing')
                        }
                      />
                      <button
                        type="button"
                        aria-label={t('edit_test_suite', { value1: suite.name })}
                        className="min-w-0 truncate rounded text-base font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        onClick={() => onEditSuite(suite)}
                      >
                        {suite.name}
                      </button>
                      {counts.failed > 0 && (
                        <Badge tone="critical">
                          {counts.failed} {t('failing')}
                        </Badge>
                      )}
                    </span>
                    <span className="ui-mono text-base text-ink-2">{suite.tests.length}</span>
                    <span className="flex items-center gap-2">
                      <SplitBar
                        segments={healthSplits(counts)}
                        className="w-full max-w-[120px] flex-1"
                      />
                      <span className="ui-mono shrink-0 text-sm text-ink-2">
                        {passRateOf(suite).toFixed(0)}%
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5 text-sm text-ink-3">
                      <Icon name="clock" size={12} />
                      {suite.lastRunMinutesAgo === null
                        ? t('never_2')
                        : t('ago_value', { value: age(suite.lastRunMinutesAgo) })}
                    </span>
                    <span className="truncate text-sm text-ink-3">{suite.owner}</span>
                    <button
                      type="button"
                      aria-label={t('test_suite_2', {
                        value1: expanded ? t('collapse') : t('expand'),
                        value2: suite.name,
                      })}
                      aria-expanded={expanded}
                      aria-controls={contentId}
                      className="grid h-6 w-6 place-items-center justify-self-end rounded text-ink-3 transition-colors hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                      onClick={() => onToggleSuite(suite.id)}
                    >
                      <Icon
                        name="chevron"
                        size={14}
                        className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
                      />
                    </button>
                  </div>

                  {expanded && (
                    <div id={contentId} className="border-t border-line-soft bg-plane/45 px-4 py-2">
                      {suite.tests.length === 0 ? (
                        <EmptyState className="py-5">{t('no_tests_in_this_suite_yet')}</EmptyState>
                      ) : (
                        <ul
                          className="space-y-0.5"
                          aria-label={t('tests_4', { value1: suite.name })}
                        >
                          {suite.tests.map((test) => {
                            const verdict = verdictTone[test.status];
                            return (
                              <li key={test.id}>
                                <button
                                  type="button"
                                  className="grid w-full grid-cols-[minmax(0,1fr)_88px_88px] items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent"
                                  onClick={() => onOpenTest(test)}
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    <StatusDot tone={verdict.tone} label={verdict.label} />
                                    <span className="truncate text-sm font-medium text-ink-2">
                                      {test.name}
                                    </span>
                                  </span>
                                  <span className="text-sm text-ink-3">{t(verdict.label)}</span>
                                  <span className="ui-mono text-right text-xs text-ink-3">
                                    {test.seconds === undefined
                                      ? t('never_run')
                                      : ms(test.seconds * 1000)}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {rows.length === 0 && (
              <EmptyState>
                {t('no_suites_match')}
                {query}”.
              </EmptyState>
            )}
          </Panel>

          <Panel className="flex flex-col">
            <PanelHeader
              title={t('recent_activity')}
              subtitle={
                dataStatus === 'local'
                  ? t('27_changes_this_week')
                  : t('recent_events', { count: liveActivity.length })
              }
            />
            {dataStatus === 'live' ? (
              liveActivity.length === 0 ? (
                <EmptyState>{t('no_recent_project_activity_yet')}</EmptyState>
              ) : (
                <ul className="min-h-0 flex-1 divide-y divide-line-soft overflow-y-auto">
                  {liveActivity.map((item) => (
                    <li key={item.id} className="flex gap-2.5 px-4 py-3">
                      <span
                        className="mt-px grid h-6 w-6 shrink-0 place-items-center rounded-md bg-raised"
                        style={{ color: toneInk[item.tone] }}
                      >
                        <Icon name={item.icon} size={12} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base">{item.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-ink-3">
                          {item.detail}
                        </span>
                      </span>
                      <span className="ui-mono shrink-0 text-xs text-ink-3">
                        {age(item.minutesAgo)}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <ul className="min-h-0 flex-1 divide-y divide-line-soft overflow-y-auto">
                {activity.map((item) => {
                  const tone = activityTone[item.kind];
                  return (
                    <li key={item.id} className="flex gap-2.5 px-4 py-3">
                      <span
                        className="mt-px grid h-6 w-6 shrink-0 place-items-center rounded-md bg-raised"
                        style={{ color: toneInk[tone.tone] }}
                      >
                        <Icon name={tone.icon} size={12} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base">{item.test}</span>
                        <span className="mt-0.5 block truncate text-xs text-ink-3">
                          {t(tone.label)} {t('in_2')} {item.suite} · {item.author}
                        </span>
                      </span>
                      <span className="ui-mono shrink-0 text-xs text-ink-3">
                        {age(item.minutesAgo)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </section>
      </div>
    </div>
  );
};
