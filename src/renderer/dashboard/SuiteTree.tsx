import { useRef, useState } from 'react';

import { Badge, Icon, IconButton, SplitBar, StatusDot } from '../design';
import { tally } from './data';
import { age } from './format';
import { healthSplits, verdictTone } from './tone';
import type { SuiteRecord, TestRecord } from './types';

/**
 * The project's structure, above the day's work. A branch shows five tests and
 * a health bar; the rest is one click away, because the rail is for orienting,
 * not for reading every test name in the project.
 */
export const SuiteTree = ({
  suites,
  activeTestId,
  onOpenTest,
  onReorder,
  onLog,
}: {
  suites: SuiteRecord[];
  activeTestId?: string;
  onOpenTest: (test: TestRecord) => void;
  onReorder: (suiteId: string, from: number, to: number) => void;
  onLog: (message: string) => void;
}) => (
  <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1.5 pb-2">
    {suites.map((suite) => (
      <SuiteBranch
        key={suite.id}
        suite={suite}
        activeTestId={activeTestId}
        onOpenTest={onOpenTest}
        onReorder={onReorder}
        onLog={onLog}
      />
    ))}
  </ul>
);

const SuiteBranch = ({
  suite,
  activeTestId,
  onOpenTest,
  onReorder,
  onLog,
}: {
  suite: SuiteRecord;
  activeTestId?: string;
  onOpenTest: (test: TestRecord) => void;
  onReorder: (suiteId: string, from: number, to: number) => void;
  onLog: (message: string) => void;
}) => {
  const [open, setOpen] = useState(suite.name === 'Checkout');
  const [showAll, setShowAll] = useState(false);
  // A ref, not state: the drop handler must read the index the drag started
  // with, without depending on a re-render having happened in between.
  const dragIndex = useRef<number | null>(null);
  const counts = tally(suite);
  const visible = open ? suite.tests.slice(0, showAll ? undefined : 5) : [];
  const hidden = suite.tests.length - 5;

  return (
    <li>
      <div
        className={`group flex items-center gap-1 rounded-md pr-1 transition-colors hover:bg-raised ${
          open ? 'bg-raised' : ''
        }`}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-[7px] text-left"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <Icon
            name="chevron"
            size={12}
            className={`mt-1 shrink-0 text-ink-3 transition-transform ${open ? 'rotate-90' : ''}`}
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-base font-medium">{suite.name}</span>
              <Badge mono>{suite.tests.length}</Badge>
              {counts.failed > 0 && (
                <span className="ml-auto flex shrink-0 items-center gap-1 text-xs font-semibold text-critical">
                  <Icon name="alert" size={11} />
                  {counts.failed}
                </span>
              )}
            </span>
            <span className="mt-1.5 flex items-center gap-2">
              <SplitBar segments={healthSplits(counts)} className="flex-1" />
              <span className="ui-mono shrink-0 text-xs text-ink-3">
                {age(suite.lastRunMinutesAgo)}
              </span>
            </span>
          </span>
        </button>
        <IconButton
          icon="plus"
          size="sm"
          label={`Add a test to ${suite.name}`}
          className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
          onClick={() => onLog(`New test in ${suite.name} — the recorder would open here`)}
        />
        <IconButton
          icon="dots"
          size="sm"
          label={`More actions for ${suite.name}`}
          title="Rename · duplicate · move · delete"
          className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
          onClick={() => onLog(`${suite.name} · rename, duplicate, move, delete`)}
        />
      </div>

      {open && (
        <ul className="ml-[15px] mt-0.5 border-l border-line-soft pl-1.5">
          {visible.map((test, index) => (
            <li
              key={test.id}
              draggable
              onDragStart={() => {
                dragIndex.current = index;
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                const from = dragIndex.current;
                if (from !== null && from !== index) {
                  onReorder(suite.id, from, index);
                  onLog(`Reordered ${suite.name} · ${from + 1} → ${index + 1}`);
                }
                dragIndex.current = null;
              }}
            >
              <button
                type="button"
                className={`group flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors ${
                  activeTestId === test.id ? 'bg-accent-wash' : 'hover:bg-raised'
                }`}
                onClick={() => onOpenTest(test)}
              >
                <Icon
                  name="grip"
                  size={12}
                  className="shrink-0 cursor-grab text-ink-3 opacity-0 group-hover:opacity-100"
                />
                <StatusDot
                  tone={verdictTone[test.status].tone}
                  label={verdictTone[test.status].label}
                />
                <span className="truncate text-sm text-ink-2">{test.name}</span>
                <span className="ui-mono ml-auto shrink-0 text-xs text-ink-3">
                  {age(test.minutesAgo)}
                </span>
              </button>
            </li>
          ))}
          {hidden > 0 && (
            <li>
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-sm text-ink-3 hover:bg-raised hover:text-ink"
                onClick={() => setShowAll((current) => !current)}
              >
                {showAll ? 'Show less' : `Show ${hidden} more`}
              </button>
            </li>
          )}
        </ul>
      )}
    </li>
  );
};
