import { useTranslation } from '@warpunit/slang-react';
import { Legend, Ribbon, SectionLabel } from '../../../ui/design';
import { age } from '../format';
import { ribbonColor, verdictTone } from '../tone';
import type { Failure, RunVerdict } from '../types';

const legendOrder: RunVerdict[] = ['passed', 'failed', 'flaky', 'skipped'];

/**
 * Is this new, or has it been rotting? The ribbon answers that faster than a
 * number can: alternating cells mean flaky, a solid tail means broken since a
 * known point.
 */
export const HistoryView = ({ failure }: { failure: Failure }) => {
  const { t } = useTranslation();
  const failed = failure.history.filter((verdict) => verdict === 'failed').length;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center gap-3">
          <SectionLabel>{t('last_24_runs')}</SectionLabel>
          <Legend
            shape="square"
            className="ml-auto"
            items={legendOrder.map((verdict) => ({
              id: verdict,
              label: verdictTone[verdict].label,
              color: ribbonColor(verdict),
            }))}
          />
        </div>

        <Ribbon
          cells={failure.history.map((verdict, index) => ({
            id: `run-${index}`,
            color: ribbonColor(verdict),
            label: `run −${failure.history.length - index} · ${verdictTone[verdict].label}`,
          }))}
        />

        <p className="mt-2 text-ink-3">
          {failed} {t('failures_in_24_runs_first_seen')} {age(failure.ageMinutes)} {t('ago_2')}{' '}
          {failure.kind === 'flaky'
            ? t('alternates_green_and_red_on_the_same_commit')
            : t('consistent')}
        </p>
      </div>

      <div className="rounded-lg border border-line bg-plane p-3">
        <SectionLabel>{t('timeline')}</SectionLabel>
        <ul className="mt-2 space-y-2 ">
          {[
            [`${age(failure.ageMinutes)} ago`, `First failure on ${failure.env}`],
            ['2h ago', `${failure.owner} was assigned`],
            ['5h ago', 'Locator changed in commit 8e715a3'],
            ['1d ago', 'Last green run'],
          ].map(([when, what]) => (
            <li key={what} className="flex gap-3">
              <span className="ui-mono w-16 shrink-0 text-ink-3">{when}</span>
              <span className="text-ink-2">{what}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
