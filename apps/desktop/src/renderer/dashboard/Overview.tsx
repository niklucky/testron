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
} from '../design';
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
            title={dataStatus === 'loading' ? 'Loading project overview' : 'Overview unavailable'}
            subtitle={
              dataStatus === 'loading'
                ? 'Fetching the selected project snapshot…'
                : (errorMessage ?? 'The server workspace could not be loaded.')
            }
          />
          <EmptyState>
            {dataStatus === 'loading'
              ? 'Summary values will appear when the workspace finishes loading.'
              : 'Check the server connection and refresh the workspace.'}
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
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">Project overview</h1>
            <p className="mt-1 text-base text-ink-3">
              {suites.length} suites · {shownTotals.tests} tests · last run{' '}
              {lastRunMinutesAgo === null ? 'never' : `${age(lastRunMinutesAgo)} ago`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SegmentedControl
              variant="solid"
              label="Chart range"
              items={ranges}
              value={String(range)}
              onChange={(value) => patch({ range: Number(value) })}
            />
            <Button
              icon="play"
              onClick={() => onLog(`Queued a full run of ${shownTotals.tests} tests`)}
            >
              Run all
            </Button>
          </div>
        </div>

        <section className="mt-4 grid grid-cols-6 gap-3 max-[1150px]:grid-cols-4 max-[820px]:grid-cols-2">
          <StatCard
            icon="test"
            label="Total tests"
            value={shownTotals.tests}
            delta={dataStatus === 'local' ? <Trend value={12} digits={0} /> : undefined}
            foot={
              dataStatus === 'local'
                ? `in ${suites.length} suites · 12 added this month`
                : `in ${suites.length} suites`
            }
          />
          <StatCard
            icon="check"
            label="Pass rate"
            value={passRate === null ? '—' : `${passRate.toFixed(1)}%`}
            delta={dataStatus === 'local' ? <Trend value={2.1} unit="pts" /> : undefined}
            foot={`${shownTotals.passed} passed · ${shownTotals.skipped} without result · ${shownTotals.failed} failed`}
          />
          <StatCard
            icon="play"
            label="Test runs · 30d"
            value={runs.toLocaleString()}
            delta={dataStatus === 'local' ? <Trend value={18.2} unit="%" /> : undefined}
            foot={dataStatus === 'local' ? 'avg 48s per test · −15% duration' : 'completed runs'}
          />
          <StatCard
            icon="alert"
            label="Needs attention"
            value={shownTotals.failed}
            delta={dataStatus === 'local' ? <Badge tone="warning">3 flaky</Badge> : undefined}
            foot={`failing in ${suites.filter((suite) => tally(suite).failed > 0).length} suites`}
          />

          <Panel className="col-span-2 flex flex-col p-4">
            <div className="flex items-center gap-2">
              <p className="flex items-center gap-2 text-sm text-ink-3">
                <Icon name="steps" size={14} />
                Test runs · last {range} days
              </p>
              <Legend items={runLegend} className="ml-auto" />
            </div>
            <StackedBars data={chart} series={runSeries} compact />
          </Panel>
        </section>

        {dataStatus === 'live' && shownTotals.tests === 0 && runs === 0 && (
          <Panel className="mt-3">
            <EmptyState>This project has no tests or runs yet.</EmptyState>
          </Panel>
        )}

        <section className="mt-3 grid grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] gap-3 max-[1240px]:grid-cols-1">
          <Panel className="flex min-h-0 flex-col">
            <PanelHeader
              title="Test suites"
              subtitle={`${rows.length} of ${suites.length} suites`}
              action={
                <div className="flex items-center gap-2">
                  <SearchField
                    label="Filter test suites"
                    placeholder="Filter suites…"
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
                    Needs attention
                  </Button>
                </div>
              }
            />

            <div className={`grid ${columns} border-b border-line-soft px-4 py-2`}>
              <SortHead label="Suite" sortKey="name" />
              <SortHead label="Tests" sortKey="tests" />
              <SortHead label="Pass rate" sortKey="passRate" />
              <SortHead label="Last run" sortKey="lastRun" />
              <span className="text-2xs font-bold uppercase tracking-[0.09em] text-ink-3">
                Owner
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
                            ? `${counts.failed} failing`
                            : counts.skipped > 0
                              ? 'Some tests skipped'
                              : 'All passing'
                        }
                      />
                      <button
                        type="button"
                        aria-label={`Edit ${suite.name} test suite`}
                        className="min-w-0 truncate rounded text-base font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        onClick={() => onEditSuite(suite)}
                      >
                        {suite.name}
                      </button>
                      {counts.failed > 0 && <Badge tone="critical">{counts.failed} failing</Badge>}
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
                        ? 'Never'
                        : `${age(suite.lastRunMinutesAgo)} ago`}
                    </span>
                    <span className="truncate text-sm text-ink-3">{suite.owner}</span>
                    <button
                      type="button"
                      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${suite.name} test suite`}
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
                        <EmptyState className="py-5">No tests in this suite yet.</EmptyState>
                      ) : (
                        <ul className="space-y-0.5" aria-label={`${suite.name} tests`}>
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
                                  <span className="text-sm text-ink-3">{verdict.label}</span>
                                  <span className="ui-mono text-right text-xs text-ink-3">
                                    {test.seconds === undefined
                                      ? 'Never run'
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

            {rows.length === 0 && <EmptyState>No suites match “{query}”.</EmptyState>}
          </Panel>

          <Panel className="flex flex-col">
            <PanelHeader
              title="Recent activity"
              subtitle={
                dataStatus === 'local'
                  ? '27 changes this week'
                  : `${liveActivity.length} recent ${liveActivity.length === 1 ? 'event' : 'events'}`
              }
            />
            {dataStatus === 'live' ? (
              liveActivity.length === 0 ? (
                <EmptyState>No recent project activity yet.</EmptyState>
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
                          {tone.label} in {item.suite} · {item.author}
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
