import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { LibrarySnapshot, TestRecord } from '../../../lib/library';
import { Button, Icon, IconButton } from '../../ui/design';

const SelectionCheckbox = ({
  label,
  checked,
  mixed = false,
  disabled = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  mixed?: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) => {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (input.current) input.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <input
      ref={input}
      type="checkbox"
      aria-label={label}
      aria-checked={mixed ? 'mixed' : checked}
      checked={checked}
      disabled={disabled}
      className="size-4 shrink-0 accent-accent"
      onChange={(event) => onChange(event.target.checked)}
    />
  );
};

export const ScheduleTestPicker = ({
  tests,
  suites,
  selectedTestIds,
  environmentName,
  onApply,
  onCancel,
}: {
  tests: TestRecord[];
  suites: LibrarySnapshot['testSuites'];
  selectedTestIds: string[];
  environmentName: string;
  onApply: (ids: string[]) => void;
  onCancel: () => void;
}) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [selected, setSelected] = useState(() => new Set(selectedTestIds));
  const [expanded, setExpanded] = useState<Set<string | null>>(() => new Set());

  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  const groups = suites.map((suite) => ({
    id: suite.id as string | null,
    name: suite.name,
    tests: tests.filter((test) => test.testSuiteId === suite.id),
  }));
  groups.push({
    id: null,
    name: 'Unassigned',
    tests: tests.filter((test) => !suites.some((suite) => suite.id === test.testSuiteId)),
  });
  const selectedIds = tests.filter((test) => selected.has(test.id)).map((test) => test.id);
  const allSelected = tests.length > 0 && selectedIds.length === tests.length;
  const selectTests = (ids: string[], checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby={headingId}
      className="m-auto w-[min(640px,calc(100vw-40px))] max-h-[calc(100vh-40px)] overflow-hidden rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/50"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="flex max-h-[calc(100vh-40px)] flex-col">
        <header className="flex shrink-0 items-start gap-3 border-b border-line p-5">
          <div className="min-w-0 flex-1">
            <h2 id={headingId} className="text-lg font-semibold">
              Select tests
            </h2>
            <p className="mt-1 text-ink-3">
              Tests available in {environmentName}. Select individual tests or entire suites.
            </p>
          </div>
          <IconButton icon="close" label="Close test selector" onClick={onCancel} />
        </header>
        <div className="flex shrink-0 items-center justify-between border-b border-line-soft px-5 py-3">
          <label className="flex cursor-pointer items-center gap-2 font-medium">
            <SelectionCheckbox
              label={allSelected ? 'Deselect all' : 'Select all'}
              checked={allSelected}
              mixed={selectedIds.length > 0 && !allSelected}
              disabled={tests.length === 0}
              onChange={(checked) =>
                selectTests(
                  tests.map((test) => test.id),
                  checked,
                )
              }
            />
            {allSelected ? 'Deselect all' : 'Select all'}
          </label>
          <span className="text-ink-3">
            {selectedIds.length} of {tests.length} selected
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {groups
            .filter((group) => group.tests.length > 0)
            .map((group) => {
              const count = group.tests.filter((test) => selected.has(test.id)).length;
              const open = expanded.has(group.id);
              return (
                <section
                  key={group.id ?? 'unassigned'}
                  aria-label={group.name}
                  className="mb-2 rounded-lg border border-line-soft last:mb-0"
                >
                  <div className="flex items-center gap-2 rounded-lg bg-plane px-3 py-2.5">
                    <SelectionCheckbox
                      label={`Select suite ${group.name}`}
                      checked={count === group.tests.length}
                      mixed={count > 0 && count < group.tests.length}
                      onChange={(checked) =>
                        selectTests(
                          group.tests.map((test) => test.id),
                          checked,
                        )
                      }
                    />
                    <button
                      type="button"
                      aria-label={`${open ? 'Collapse' : 'Expand'} ${group.name}`}
                      aria-expanded={open}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() =>
                        setExpanded((current) => {
                          const next = new Set(current);
                          if (open) next.delete(group.id);
                          else next.add(group.id);
                          return next;
                        })
                      }
                    >
                      <Icon
                        name="chevron"
                        size={12}
                        className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
                      />
                      <Icon name="suite" size={14} className="shrink-0 text-ink-3" />
                      <span className="min-w-0 flex-1 truncate font-medium">{group.name}</span>
                      <span className="shrink-0 text-xs text-ink-3">
                        {count}/{group.tests.length}
                      </span>
                    </button>
                  </div>
                  {open && (
                    <div className="space-y-0.5 border-t border-line-soft py-1 pl-8 pr-2">
                      {group.tests.map((test) => (
                        <label
                          key={test.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 hover:bg-raised"
                        >
                          <SelectionCheckbox
                            label={test.title}
                            checked={selected.has(test.id)}
                            onChange={(checked) => selectTests([test.id], checked)}
                          />
                          <span className="min-w-0 truncate" title={test.title}>
                            {test.title}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          {tests.length === 0 && (
            <p className="px-2 py-8 text-center text-ink-3">No tests support this environment.</p>
          )}
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line p-4">
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={() => onApply(selectedIds)}>
            Apply selection
          </Button>
        </footer>
      </div>
    </dialog>,
    document.body,
  );
};
