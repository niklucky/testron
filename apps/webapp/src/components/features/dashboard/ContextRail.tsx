import { useTranslation } from '@warpunit/slang-react';
import { HeatMap, Icon, Kbd, Meter, Panel, SectionLabel } from '../../ui/design';
import { dashboardShortcutGroups, displayShortcutGroup } from './hotkeys';
import { failureGrid, type ProjectRun } from './runHistory';
import type { Failure, SuiteRecord } from './types';

/**
 * Everything you might want *while* triaging, and nothing you have to click:
 * how big the queue is, which suites are burning, and how much is running. It is
 * the first thing to go in focus mode.
 */
export const ContextRail = ({
  failures,
  runs,
  suites,
}: {
  failures: Failure[];
  runs: ProjectRun[];
  suites: SuiteRecord[];
}) => {
  const { t } = useTranslation();
  const finishedDurations = runs
    .filter((run) => run.verdict !== 'running')
    .map((run) => run.seconds)
    .sort((left, right) => left - right);
  const medianDuration = finishedDurations[Math.floor(finishedDurations.length / 2)] ?? 0;
  const runsToday = runs.filter((run) => run.minutesAgo < 1_440).length;
  const runsLastHour = runs.filter((run) => run.minutesAgo < 60).length;
  const pulse = failureGrid(
    runs.filter((run) => run.minutesAgo < 14 * 1_440),
    14,
  );
  const queueBySuite = suites
    .map((suite) => ({
      name: suite.name,
      open: failures.filter((failure) => failure.suite === suite.name).length,
    }))
    .filter((suite) => suite.open > 0)
    .sort((left, right) => right.open - left.open);
  const busiest = Math.max(1, ...queueBySuite.map((suite) => suite.open));

  return (
    <section className="flex min-h-0 flex-col gap-4 overflow-y-auto border-l border-line p-3">
      <div className="grid grid-cols-2 gap-2">
        {[
          {
            label: 'Open failures',
            value: String(failures.length),
            sub: t('new_failures', {
              value1: failures.filter((failure) => failure.kind === 'new').length,
            }),
          },
          {
            label: 'Failing tests',
            value: String(failures.length),
            sub: t('suites_summary', { count: queueBySuite.length }),
          },
          {
            label: 'median_duration',
            value: `${medianDuration.toFixed(1)}s`,
            sub: t('finished_runs', { value1: finishedDurations.length }),
          },
          {
            label: 'Runs today',
            value: String(runsToday),
            sub: t('runs_in_last_hour', { value1: runsLastHour }),
          },
        ].map((tile) => (
          <Panel key={tile.label} className="p-2.5">
            <p className="text-ink-3">{t(tile.label)}</p>
            <p className="mt-1 font-semibold leading-none tabular-nums">{tile.value}</p>
            <p className="mt-1.5 text-ink-3">{t(tile.sub)}</p>
          </Panel>
        ))}
      </div>

      <div>
        <h3 className="mb-2">
          <SectionLabel>{t('suite_pulse_failures_day')}</SectionLabel>
        </h3>
        <HeatMap
          rows={pulse}
          thresholds={[3, 5, 7]}
          legendLabels={['none', '1–2', '3–4', '5–6', '7+']}
          meta="14 days"
          cellLabel={(row, value, index) =>
            `${row.label} · day −${row.values.length - index} · ${
              value === 0 ? t('no_failures') : t('failures_count', { count: value })
            }`
          }
        />
      </div>

      <div>
        <h3 className="mb-2">
          <SectionLabel>{t('queue_by_suite')}</SectionLabel>
        </h3>
        <ul className="space-y-1.5">
          {queueBySuite.map((suite) => (
            <li key={suite.name} className="flex items-center gap-2">
              <span className="w-[88px] shrink-0 truncate text-ink-2">{suite.name}</span>
              <Meter
                className="flex-1"
                value={suite.open / busiest}
                label={t('open_3', { value1: suite.open })}
              />
              <span className="ui-mono w-4 shrink-0 text-right text-ink-3">{suite.open}</span>
            </li>
          ))}
          {queueBySuite.length === 0 && (
            <li className="text-ink-3">{t('nothing_failed_enjoy_it')}</li>
          )}
        </ul>
      </div>

      <Panel className="p-3">
        <h3 className="mb-2 flex items-center gap-1.5">
          <Icon name="keyboard" size={14} className="text-ink-2" />
          <SectionLabel>{t('hands_stay_home')}</SectionLabel>
        </h3>
        <ul className="space-y-1.5 text-ink-3">
          {dashboardShortcutGroups.map((group) => (
            <li key={group.description} className="flex items-center gap-2">
              <span className="w-[66px] shrink-0">
                <Kbd>{displayShortcutGroup(group)}</Kbd>
              </span>
              <span>{group.description}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </section>
  );
};
