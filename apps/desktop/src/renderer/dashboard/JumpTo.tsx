import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHotkeys } from '@tanstack/react-hotkeys';

import { Icon, Kbd } from '../design';

export type JumpToItem = {
  id: string;
  label: string;
  detail: string;
  keywords?: string;
  onSelect(): void;
};

export const JumpTo = ({
  open,
  items,
  shortcut,
  onClose,
}: {
  open: boolean;
  items: JumpToItem[];
  shortcut: string;
  onClose(): void;
}) => {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      `${item.label} ${item.detail} ${item.keywords ?? ''}`.toLowerCase().includes(needle),
    );
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCursor(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(
    () => setCursor((current) => Math.min(current, Math.max(results.length - 1, 0))),
    [results.length],
  );

  const select = () => {
    const item = results[cursor];
    if (!item) return;
    item.onSelect();
    onClose();
  };

  useHotkeys(
    [
      { hotkey: 'Escape', callback: onClose },
      {
        hotkey: 'ArrowDown',
        callback: () => setCursor((current) => Math.min(current + 1, results.length - 1)),
      },
      { hotkey: 'ArrowUp', callback: () => setCursor((current) => Math.max(current - 1, 0)) },
      { hotkey: 'Enter', callback: select },
    ],
    { enabled: open, ignoreInputs: false, target: dialogRef, requireReset: true },
  );

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex justify-center bg-black/40 px-6 pt-[12vh] [-webkit-app-region:no-drag]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-jump-to="true"
        className="h-fit w-full max-w-[620px] overflow-hidden rounded-xl border border-line bg-surface shadow-[0_24px_80px_rgba(0,0,0,0.38)]"
      >
        <h2 id={titleId} className="sr-only">
          Jump to
        </h2>
        <label className="flex h-14 items-center gap-3 border-b border-line px-4">
          <Icon name="search" size={17} className="shrink-0 text-ink-3" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            placeholder="Search views, test suites, and tests…"
            className="min-w-0 flex-1 bg-transparent text-lg text-ink outline-none placeholder:text-ink-3"
          />
          <Kbd>{shortcut}</Kbd>
        </label>

        <div className="max-h-[430px] overflow-y-auto p-2">
          {results.length ? (
            <ul role="listbox" aria-label="Jump destinations">
              {results.map((item, index) => (
                <li key={item.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === cursor}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${
                      index === cursor ? 'bg-raised text-ink' : 'text-ink-2 hover:bg-raised'
                    }`}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => {
                      item.onSelect();
                      onClose();
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate text-md font-medium">
                      {item.label}
                    </span>
                    <span className="shrink-0 text-sm text-ink-3">{item.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-10 text-center text-sm text-ink-3">No matching destination</p>
          )}
        </div>
        <footer className="flex items-center gap-4 border-t border-line px-4 py-2 text-xs text-ink-3">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>Esc close</span>
        </footer>
      </section>
    </div>,
    document.body,
  );
};
