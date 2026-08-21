import { useTranslation } from '@warpunit/slang-react';
import type { RefObject } from 'react';

import {
  Badge,
  IconButton,
  Kbd,
  SearchField,
  SectionLabel,
  SegmentedControl,
  Sparkline,
  StatusDot,
} from '../../ui/design';
import { age } from './format';
import { displayShortcut } from './hotkeys';
import { severityTone } from './tone';
import type { Failure, Scope } from './types';

const scopes: { id: Scope; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'flaky', label: 'Flaky' },
  { id: 'mine', label: 'Mine' },
];

/**
 * The day's work: one row per open failure, ordered oldest-first so nothing
 * rots at the bottom. Rows are keyboard-first (j/k) — the mouse is the
 * fallback, which is why the selected row is marked by an accent edge that
 * survives at the edge of vision.
 */
export const TriageQueue = ({
  queue,
  scope,
  onScope,
  query,
  onQuery,
  filterOpen,
  onFilterOpen,
  filterRef,
  selectedId,
  active,
  compact,
  quarantined,
  onSelect,
}: {
  queue: Failure[];
  scope: Scope;
  onScope: (scope: Scope) => void;
  query: string;
  onQuery: (query: string) => void;
  filterOpen: boolean;
  onFilterOpen: (open: boolean) => void;
  filterRef: RefObject<HTMLInputElement | null>;
  selectedId?: string;
  active: boolean;
  compact: boolean;
  quarantined: string[];
  onSelect: (index: number) => void;
}) => {
  const { t } = useTranslation();
  return (
    <section className="flex min-h-0 flex-1 flex-col border-t border-line">
      <div className="flex h-9 shrink-0 items-center gap-2 px-3">
        <SectionLabel>{t('triage')}</SectionLabel>
        <span className="ui-mono text-ink-3">{queue.length}</span>
        <span className="ml-auto flex items-center gap-1">
          <Kbd>{displayShortcut('nextFailure')}</Kbd>
          <Kbd>{displayShortcut('previousFailure')}</Kbd>
          <IconButton
            icon="search"
            size="sm"
            label={t('filter_failures')}
            onClick={() => {
              onFilterOpen(!filterOpen);
              window.setTimeout(() => filterRef.current?.focus(), 0);
            }}
          />
        </span>
      </div>

      <div className="shrink-0 px-2 pb-1.5">
        <SegmentedControl
          variant="pill"
          label={t('failure_scope')}
          items={scopes}
          value={scope}
          onChange={onScope}
        />
      </div>

      {filterOpen && (
        <SearchField
          size="sm"
          mono
          label={t('filter_the_triage_queue')}
          placeholder={t('filter_failures_2')}
          className="mx-2 mb-1.5 shrink-0"
          ref={filterRef}
          value={query}
          hint={<Kbd>{displayShortcut('closeFilter')}</Kbd>}
          onChange={(event) => onQuery(event.target.value)}
        />
      )}

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {queue.map((failure, index) => {
          const selected = failure.id === selectedId && active;
          return (
            <li key={failure.id}>
              <button
                type="button"
                aria-current={selected}
                className={`flex w-full gap-2 border-b border-l-2 border-line-soft text-left transition-colors ${
                  compact ? 'px-2.5 py-[7px]' : 'px-2.5 py-2.5'
                } ${
                  selected
                    ? 'border-l-accent bg-accent-wash'
                    : 'border-l-transparent hover:bg-raised'
                }`}
                onClick={() => onSelect(index)}
              >
                <StatusDot
                  tone={severityTone[failure.severity].tone}
                  label={severityTone[failure.severity].label}
                  className="mt-[5px]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="ui-mono truncate ">{failure.signature}</span>
                    <span className="ui-mono ml-auto shrink-0 text-ink-3">
                      ×{failure.occurrences}
                    </span>
                  </span>
                  <span className="mt-[3px] block truncate text-ink-2">{failure.test}</span>
                  <span className="mt-1.5 flex items-center gap-2">
                    <span className="truncate text-ink-3">
                      {failure.suite} · {failure.env} · {age(failure.ageMinutes)}
                    </span>
                    {failure.kind !== 'known' && (
                      <Badge
                        size="sm"
                        uppercase
                        tone={failure.kind === 'flaky' ? 'warning' : 'accent'}
                      >
                        {failure.kind}
                      </Badge>
                    )}
                    {quarantined.includes(failure.id) && (
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
        })}
        {queue.length === 0 && (
          <li className="px-3 py-6 text-center text-ink-3">
            {t('nothing_matches')}
            {query}”.
          </li>
        )}
      </ul>
    </section>
  );
};
