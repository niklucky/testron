import type { RefObject } from 'react';

import { Avatar, Button, Icon, IconButton, NavItem, SectionLabel } from '../design';
import { SuiteTree } from './SuiteTree';
import { TriageQueue } from './TriageQueue';
import type { Failure, Scope, SuiteRecord, TestRecord, Totals, View } from './types';

/**
 * The rail carries two halves of the same job: the project's *structure* on
 * top (suites you can expand, extend and reorder) and the day's *work*
 * underneath (the triage queue). Structure gets the larger share because it is
 * what people navigate by; the queue is what they work through.
 */
export const Sidebar = ({
  view,
  onView,
  suites,
  totals,
  openFailures,
  queue,
  scope,
  onScope,
  query,
  onQuery,
  filterOpen,
  onFilterOpen,
  filterRef,
  selectedFailure,
  compact,
  quarantined,
  onSelectFailure,
  onOpenTest,
  onReorder,
  onLog,
}: {
  view: View;
  onView: (view: View) => void;
  suites: SuiteRecord[];
  totals: Totals;
  openFailures: number;
  queue: Failure[];
  scope: Scope;
  onScope: (scope: Scope) => void;
  query: string;
  onQuery: (query: string) => void;
  filterOpen: boolean;
  onFilterOpen: (open: boolean) => void;
  filterRef: RefObject<HTMLInputElement | null>;
  selectedFailure: Failure;
  compact: boolean;
  quarantined: string[];
  onSelectFailure: (index: number) => void;
  onOpenTest: (test: TestRecord) => void;
  onReorder: (suiteId: string, from: number, to: number) => void;
  onLog: (message: string) => void;
}) => (
  <aside className="flex min-h-0 flex-col border-r border-line">
    <nav className="shrink-0 space-y-0.5 p-2" aria-label="Project">
      <NavItem
        icon="grid"
        label="Overview"
        active={view === 'overview'}
        onClick={() => onView('overview')}
      />
      <NavItem
        icon="triage"
        label="Triage"
        active={view === 'triage'}
        badge={openFailures}
        onClick={() => onView('triage')}
      />
      <Button
        variant="ghost"
        size="lg"
        block
        icon="record"
        onClick={() => {
          onLog('New test · recording on Staging');
          window.location.hash = '#/record';
        }}
      >
        New test
      </Button>
      <Button
        variant="ghost"
        size="lg"
        block
        icon="suite"
        onClick={() => onLog('New test suite · name it, then record the first test')}
      >
        New test suite
      </Button>
    </nav>

    <section className="flex min-h-0 flex-[1.25] flex-col border-t border-line">
      <div className="flex h-9 shrink-0 items-center gap-2 px-3">
        <SectionLabel>Test suites</SectionLabel>
        <span className="ui-mono text-xs text-ink-3">
          {suites.length} · {totals.tests}
        </span>
        <IconButton
          icon="plus"
          size="sm"
          label="Add a test suite"
          className="ml-auto"
          onClick={() => onLog('New test suite · name it, then record the first test')}
        />
      </div>
      <SuiteTree
        suites={suites}
        activeTestId={
          view === 'triage'
            ? suites
                .flatMap((suite) => suite.tests)
                .find((test) => test.failureId === selectedFailure.id)?.id
            : undefined
        }
        onOpenTest={onOpenTest}
        onReorder={onReorder}
        onLog={onLog}
      />
    </section>

    <TriageQueue
      queue={queue}
      scope={scope}
      onScope={onScope}
      query={query}
      onQuery={onQuery}
      filterOpen={filterOpen}
      onFilterOpen={onFilterOpen}
      filterRef={filterRef}
      selectedId={selectedFailure.id}
      active={view === 'triage'}
      compact={compact}
      quarantined={quarantined}
      onSelect={onSelectFailure}
    />

    <div className="shrink-0 border-t border-line p-2">
      <Button
        variant="ghost"
        size="lg"
        block
        icon="settings"
        onClick={() => onLog('Settings · environments, browsers, retries, integrations')}
      >
        Settings
      </Button>
      <button
        type="button"
        className="mt-0.5 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-raised"
      >
        <Avatar initials="NS" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium">Nikita S.</span>
          <span className="block truncate text-xs text-ink-3">Local workspace</span>
        </span>
        <Icon name="dots" size={15} className="shrink-0 text-ink-3" />
      </button>
    </div>
  </aside>
);
