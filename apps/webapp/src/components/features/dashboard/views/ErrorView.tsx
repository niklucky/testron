import { useTranslation } from '@warpunit/slang-react';
import { SectionLabel } from '../../../ui/design';
import type { Failure } from '../types';

/**
 * The raw stack, plus the two questions that follow it: which locator was
 * under test, and what else is failing next to it. A failure that co-occurs
 * with three others is usually one bug, not four.
 */
export const ErrorView = ({
  failure,
  failures,
  onSelect,
}: {
  failure: Failure;
  failures: Failure[];
  onSelect: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const similar = failures.filter(
    (candidate) => candidate.id !== failure.id && candidate.suite === failure.suite,
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2">
          <SectionLabel>{t('stack')}</SectionLabel>
        </h3>
        <pre className="ui-mono overflow-x-auto rounded-lg border border-line bg-plane p-3 leading-5 text-ink-2">
          {failure.message}
        </pre>
      </div>

      <div className="grid grid-cols-2 gap-3 max-[1100px]:grid-cols-1">
        <div className="rounded-lg border border-line bg-plane p-3">
          <p className="text-ink-3">{t('locator_under_test')}</p>
          <p className="ui-mono mt-1.5 break-all ">{failure.locator}</p>
          <p className="mt-2 text-ink-3">
            {failure.steps.length === 0
              ? t('failures_in_recent_runs', {
                  value1: failure.occurrences,
                  value2: failure.history.length,
                })
              : `${t('resolved_in')} ${failure.occurrences} ${t('of_the_last_24_runs_owner')} ${failure.owner}`}
          </p>
        </div>

        <div className="rounded-lg border border-line bg-plane p-3">
          <p className="text-ink-3">{t('seen_together_with')}</p>
          <ul className="mt-1.5 space-y-1.5">
            {similar.length === 0 && (
              <li className="text-ink-3">
                {t('nothing_else_in')} {failure.suite} {t('is_failing')}
              </li>
            )}
            {similar.map((candidate) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  className="ui-mono w-full truncate text-left text-accent hover:underline"
                  onClick={() => onSelect(candidate.id)}
                >
                  {candidate.signature} ×{candidate.occurrences}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
