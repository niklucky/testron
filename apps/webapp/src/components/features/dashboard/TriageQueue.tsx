import { useTranslation } from '@warpunit/slang-react';
import type { RefObject } from 'react';

import { IconButton, Kbd, SearchField, SectionLabel, SegmentedControl } from '../../ui/design';
import { displayShortcut } from './hotkeys';
import { TriageFailureRow } from './TriageFailureRow';
import type { Failure, Scope } from './types';

const scopes: { id: Scope; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'flaky', label: 'Flaky' },
  { id: 'mine', label: 'Mine' },
];

/**
 * The day's work: one row per currently failing test, with the latest failures
 * first. Rows are keyboard-first (j/k) — the mouse is the
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
        {queue.map((failure, index) => (
          <TriageFailureRow
            key={failure.id}
            failure={failure}
            selected={failure.id === selectedId && active}
            compact={compact}
            quarantined={quarantined.includes(failure.id)}
            onSelect={() => onSelect(index)}
          />
        ))}
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
