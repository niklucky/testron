import { useTranslation } from '@warpunit/slang-react';
import {
  Badge,
  Ribbon,
  SectionLabel,
  SegmentedControl,
  Sparkline,
  StatusDot,
  toneFill,
} from '../../ui/design';
import { age, ms } from '../dashboard/format';
import type { RunReport, Verdict } from './types';

export const verdictTone = {
  passed: { tone: 'good', label: 'Passed' },
  failed: { tone: 'critical', label: 'Failed' },
  flaky: { tone: 'warning', label: 'Flaky' },
  cancelled: { tone: 'neutral', label: 'Cancelled' },
  timedOut: { tone: 'serious', label: 'Timed out' },
} as const satisfies Record<
  Verdict,
  { tone: 'good' | 'critical' | 'warning' | 'neutral' | 'serious'; label: string }
>;

const filters = [
  { id: 'all', label: 'All' },
  { id: 'failed', label: 'Failing' },
] as const;

/**
 * Every run of this test, newest first.
 *
 * A single run is only meaningful next to the ones before it — 14s means
 * nothing until you know the last four took 12 — so the rail leads with the
 * pattern and the trend, and each row carries its own delta.
 */
export const RunRail = ({
  runs,
  selectedId,
  filter,
  onFilter,
  onSelect,
}: {
  runs: RunReport[];
  selectedId: string;
  filter: 'all' | 'failed';
  onFilter: (filter: 'all' | 'failed') => void;
  onSelect: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const ordered = [...runs].reverse();
  const shown = runs.filter((run) => filter === 'all' || run.verdict !== 'passed');
  const passed = runs.filter((run) => run.verdict === 'passed').length;

  return (
    <aside className="flex min-h-0 flex-col border-r border-line">
      <div className="shrink-0 space-y-2.5 border-b border-line px-3 py-3">
        <div className="flex items-center gap-2">
          <SectionLabel>
            {t('last_2')} {runs.length} {t('runs_3')}
          </SectionLabel>
          <span className="ui-mono ml-auto text-ink-3">
            {Math.round((passed / runs.length) * 100)}
            {t('green')}
          </span>
        </div>

        <Ribbon
          height={22}
          cells={ordered.map((run) => ({
            id: run.id,
            color: toneFill[verdictTone[run.verdict].tone],
            label: `${run.id} · ${t(verdictTone[run.verdict].label)}`,
          }))}
        />

        <div className="flex items-center gap-2">
          <Sparkline values={ordered.map((run) => run.ms / 1000)} label={t('duration_trend')} />
          <span className="text-ink-3">{t('duration_trend_2')}</span>
        </div>
      </div>

      <div className="flex h-9 shrink-0 items-center px-3">
        <SegmentedControl
          label={t('run_filter')}
          variant="pill"
          items={[...filters]}
          value={filter}
          onChange={onFilter}
        />
      </div>

      <ul className="ui-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {shown.map((run) => {
          const verdict = verdictTone[run.verdict];
          const on = run.id === selectedId;
          return (
            <li key={run.id}>
              <button
                type="button"
                aria-current={on}
                onClick={() => onSelect(run.id)}
                className={`mb-1 w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${
                  on ? 'border-accent bg-accent-wash' : 'border-transparent hover:bg-raised'
                }`}
              >
                <span className="flex items-center gap-2">
                  <StatusDot tone={verdict.tone} label={verdict.label} />
                  <span className="text-ink">{t(verdict.label)}</span>
                  {run.attempts.length > 1 && (
                    <Badge size="sm" tone="warning">
                      {run.attempts.length} {t('attempts')}
                    </Badge>
                  )}
                  <span className="ui-mono ml-auto text-ink-3">{ms(run.ms)}</span>
                </span>
                <span className="mt-1 flex items-center gap-1.5 text-ink-3">
                  <span>{run.environment}</span>·<span className="truncate">{run.by}</span>·
                  <span className="shrink-0">
                    {age(run.minutesAgo)} {t('ago')}
                  </span>
                </span>
                <span className="ui-mono mt-0.5 block truncate text-ink-3">
                  {run.branch} · {run.commit}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
};
