import { useTranslation } from '@warpunit/slang-react';

import { Badge, Sparkline, StatusDot } from '../../ui/design';
import { age } from './format';
import { severityTone } from './tone';
import type { Failure } from './types';

/** The shared failure summary used by both triage lists. */
export const TriageFailureRow = ({
  failure,
  selected,
  compact,
  quarantined,
  onSelect,
}: {
  failure: Failure;
  selected: boolean;
  compact: boolean;
  quarantined: boolean;
  onSelect: () => void;
}) => {
  const { t } = useTranslation();

  return (
    <li>
      <button
        type="button"
        aria-current={selected}
        className={`flex w-full gap-2 border-b border-l-2 border-line-soft text-left transition-colors ${
          compact ? 'px-2.5 py-[7px]' : 'px-2.5 py-2.5'
        } ${selected ? 'border-l-accent bg-accent-wash' : 'border-l-transparent hover:bg-raised'}`}
        onClick={onSelect}
      >
        <StatusDot
          tone={severityTone[failure.severity].tone}
          label={severityTone[failure.severity].label}
          className="mt-[5px]"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate">{failure.test}</span>
          <span className="mt-[3px] flex items-baseline gap-2 text-ink-2">
            <span className="ui-mono min-w-0 flex-1 truncate">{failure.signature}</span>
            <span className="ui-mono shrink-0 text-ink-3">×{failure.occurrences}</span>
          </span>
          <span className="mt-1.5 flex items-center gap-2">
            <span className="truncate text-ink-3">
              {failure.suite} · {failure.env} · {age(failure.ageMinutes)}
            </span>
            {failure.kind !== 'known' && (
              <Badge size="sm" uppercase tone={failure.kind === 'flaky' ? 'warning' : 'accent'}>
                {failure.kind}
              </Badge>
            )}
            {quarantined && (
              <Badge size="sm" uppercase>
                {t('held')}
              </Badge>
            )}
            <span className="ml-auto shrink-0">
              <Sparkline
                values={failure.spark}
                label={t('occurrences_over_7_days', { value1: failure.occurrences })}
              />
            </span>
          </span>
        </span>
      </button>
    </li>
  );
};
