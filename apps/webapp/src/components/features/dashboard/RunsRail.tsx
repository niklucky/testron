import { useTranslation } from '@warpunit/slang-react';
import { Badge, Meter, Ribbon, SectionLabel, Sparkline } from '../../ui/design';
import { age } from './format';
import { byTest, signatures, type ProjectRun } from './runHistory';
import { ribbonColor } from './tone';

/**
 * What the history adds up to.
 *
 * The table answers "what ran"; this rail answers "and what does that tell
 * us" — the tests that cannot be trusted, the ones eating the wall clock, and
 * the handful of signatures behind most of the red. Every row is a shortcut
 * into the same filter the table already supports.
 */
export const RunsRail = ({
  period,
  onFilter,
}: {
  period: ProjectRun[];
  onFilter: (query: string) => void;
}) => {
  const { t } = useTranslation();
  const tests = byTest(period);
  const unreliable = [...tests].sort((a, b) => a.passRate - b.passRate).slice(0, 5);
  const slowest = [...tests].sort((a, b) => b.slowest - a.slowest).slice(0, 4);
  const failures = signatures(period).slice(0, 4);

  return (
    <aside className="ui-scroll min-h-0 space-y-4 overflow-y-auto border-l border-line px-3 py-3">
      <section>
        <SectionLabel className="mb-2 block">{t('least_reliable')}</SectionLabel>
        <ul className="space-y-2.5">
          {unreliable.map((entry) => (
            <li key={entry.test}>
              <button
                type="button"
                className="w-full text-left"
                onClick={() => onFilter(entry.test)}
              >
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-base">{entry.test}</span>
                  <span className="ui-mono shrink-0 text-xs text-ink-3">
                    {entry.passRate.toFixed(0)}%
                  </span>
                </span>
                <Ribbon
                  className="mt-1"
                  height={8}
                  cells={entry.recent.map((verdict, index) => ({
                    id: `${entry.test}-${index}`,
                    color: verdict === 'running' ? 'var(--ui-accent)' : ribbonColor(verdict),
                    label: verdict,
                  }))}
                />
                <span className="mt-1 flex items-center gap-1.5 text-xs text-ink-3">
                  {entry.suite} · {entry.runs} {t('runs_3')}
                  {entry.flaky > 0 && (
                    <Badge size="sm" tone="warning">
                      {entry.flaky} {t('flaky')}
                    </Badge>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-line-soft pt-3">
        <SectionLabel className="mb-2 block">{t('slowest')}</SectionLabel>
        <ul className="space-y-2">
          {slowest.map((entry) => (
            <li key={entry.test}>
              <p className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-base">{entry.test}</span>
                <span className="ui-mono shrink-0 text-xs text-ink-3">
                  {entry.slowest.toFixed(0)}
                  {t('s')}
                </span>
              </p>
              <Meter
                className="mt-1"
                height={4}
                value={entry.slowest / Math.max(1, slowest[0].slowest)}
                tone="neutral"
                label={t('s_at_its_worst', { value1: entry.slowest.toFixed(0) })}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-line-soft pt-3">
        <SectionLabel className="mb-2 block">{t('failure_signatures')}</SectionLabel>
        <ul className="space-y-2">
          {failures.map((entry) => (
            <li key={entry.signature}>
              <button
                type="button"
                className="w-full text-left"
                onClick={() => onFilter(entry.signature)}
              >
                <span className="ui-mono block truncate text-sm text-ink-2">{entry.signature}</span>
                <span className="flex items-center gap-1.5 text-xs text-ink-3">
                  {entry.count} {t('runs_last')} {age(entry.lastSeen)} {t('ago')}
                </span>
              </button>
            </li>
          ))}
          {failures.length === 0 && (
            <li className="text-sm text-ink-3">{t('nothing_failed_enjoy_it')}</li>
          )}
        </ul>
      </section>

      <section className="border-t border-line-soft pt-3">
        <SectionLabel className="mb-2 block">{t('volume')}</SectionLabel>
        <div className="flex items-center gap-2">
          <Sparkline
            width={120}
            height={24}
            values={Array.from(
              { length: 14 },
              (_, index) =>
                period.filter((run) => Math.floor(run.minutesAgo / 1_440) === 13 - index).length,
            )}
            label={t('runs_per_day')}
          />
          <span className="text-xs text-ink-3">{t('runs_per_day_2')}</span>
        </div>
      </section>
    </aside>
  );
};
