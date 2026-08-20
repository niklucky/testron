import { useState, type ReactNode } from 'react';

import { Badge, Button, Icon, IconButton, Kbd } from '../design';
import { sourceText, type CodeLine } from '../record/codegen';
import { CodePanel } from '../record/CodePanel';
import { InlineSelect } from './InlineField';
import { displayTestViewShortcut } from './hotkeys';
import { prerequisiteLabels, type Prerequisite, type PrerequisiteKind } from './types';

/** The shell every dialog on this screen shares. */
const Sheet = ({
  title,
  subtitle,
  width = 460,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  width?: number;
  onClose: () => void;
  children: ReactNode;
}) => (
  <div
    className="absolute inset-0 z-40 grid place-items-center p-8"
    style={{ background: 'var(--ui-overlay)' }}
    onClick={onClose}
  >
    <section
      role="dialog"
      aria-label={title}
      style={{ width, maxHeight: '100%' }}
      className="flex min-h-0 flex-col rounded-xl border border-line bg-surface shadow-2xl"
      onClick={(event) => event.stopPropagation()}
    >
      <header className="flex shrink-0 items-start gap-3 border-b border-line-soft px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-md font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-sm text-ink-3">{subtitle}</p>}
        </div>
        <IconButton icon="close" size="sm" label="Close" className="ml-auto" onClick={onClose} />
      </header>
      {children}
    </section>
  </div>
);

/**
 * The generated spec.
 *
 * Read-only until you say otherwise, because the arrow only points one way:
 * steps generate source, and nothing reads source back into steps. Detaching
 * is a real decision — the board stops driving the file — so it is a button
 * with a warning next to it, not an editable textarea you can fall into.
 */
export const SourceSheet = ({
  lines,
  file,
  detached,
  source,
  onDetach,
  onSource,
  onReattach,
  onClose,
  onLog,
  canDetach = true,
  onCopy,
  layout = 'modal',
}: {
  lines: CodeLine[];
  file: string;
  detached: boolean;
  source: string;
  onDetach: () => void;
  onSource: (source: string) => void;
  onReattach: () => void;
  onClose: () => void;
  onLog: (message: string) => void;
  canDetach?: boolean;
  onCopy?: () => void;
  layout?: 'modal' | 'docked';
}) => {
  const content = (
    <>
      <header className="flex shrink-0 items-start gap-3 border-b border-line-soft px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-md font-semibold">Auto test source</h2>
          <p className="mt-0.5 truncate text-sm text-ink-3">{file}</p>
        </div>
        {layout === 'modal' && (
          <Kbd className="ml-auto">{displayTestViewShortcut('closeSource')}</Kbd>
        )}
        <IconButton
          icon="close"
          size="sm"
          label="Close"
          className={layout === 'modal' ? '' : 'ml-auto'}
          onClick={onClose}
        />
      </header>
      <div className="ui-scroll min-h-0 flex-1 overflow-auto border-b border-line-soft bg-plane">
        {detached ? (
          <textarea
            aria-label="Test source"
            value={source}
            spellCheck={false}
            onChange={(event) => onSource(event.target.value)}
            className="ui-mono h-[420px] w-full resize-none bg-transparent p-3 text-base leading-[19px] text-ink outline-none"
          />
        ) : (
          <CodePanel lines={lines} onSelectStep={() => undefined} />
        )}
      </div>

      <footer className="flex shrink-0 items-center gap-2 px-4 py-3">
        {detached ? (
          <>
            <Badge tone="warning" icon="alert">
              Detached
            </Badge>
            <span className="text-sm text-ink-3">Board edits no longer reach this file.</span>
            <Button
              className="ml-auto"
              icon="rerun"
              onClick={() => {
                onReattach();
                onLog('Source regenerated from the board · hand edits discarded');
              }}
            >
              Regenerate from board
            </Button>
          </>
        ) : (
          <>
            <Badge tone="good" icon="check">
              In sync
            </Badge>
            <span className="text-sm text-ink-3">Regenerated from the board on every edit.</span>
            <Button
              className="ml-auto"
              icon="copy"
              onClick={() => {
                if (onCopy) onCopy();
                else void navigator.clipboard?.writeText(sourceText(lines));
                onLog('Spec copied to the clipboard');
              }}
            >
              Copy
            </Button>
            {canDetach && (
              <Button
                icon="pencil"
                onClick={() => {
                  onDetach();
                  onLog('Source detached · the board no longer regenerates it');
                }}
              >
                Edit by hand
              </Button>
            )}
          </>
        )}
      </footer>
    </>
  );

  if (layout === 'docked')
    return (
      <aside
        aria-label="Auto test source"
        className="flex min-h-0 min-w-0 flex-col border-l border-line bg-surface"
      >
        {content}
      </aside>
    );

  return (
    <div
      className="absolute inset-0 z-40 grid place-items-center p-4"
      style={{ background: 'var(--ui-overlay)' }}
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-label="Auto test source"
        className="flex h-full min-h-0 w-full flex-col rounded-xl border border-line bg-surface shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {content}
      </section>
    </div>
  );
};

/** Editing one prerequisite. Small enough to be inline, structured enough not to be. */
export const PrerequisiteSheet = ({
  prerequisite,
  onSave,
  onClose,
}: {
  prerequisite: Prerequisite;
  onSave: (prerequisite: Prerequisite) => void;
  onClose: () => void;
}) => {
  const [draft, setDraft] = useState(prerequisite);
  const field =
    'mt-1.5 h-8 w-full rounded-md border border-line bg-plane px-2.5 text-base outline-none focus:border-accent';

  return (
    <Sheet title="Prerequisite" subtitle="Satisfied before the first step runs" onClose={onClose}>
      <div className="space-y-3 px-4 py-4">
        <label className="block">
          <span className="text-sm text-ink-3">Kind</span>
          <div className="mt-1.5">
            <InlineSelect
              label="Prerequisite kind"
              value={draft.kind}
              options={Object.entries(prerequisiteLabels).map(([id, label]) => ({
                id: id as PrerequisiteKind,
                label,
              }))}
              onChange={(kind) => setDraft({ ...draft, kind })}
            />
          </div>
        </label>

        <label className="block">
          <span className="text-sm text-ink-3">Title</span>
          <input
            className={field}
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
        </label>

        <label className="block">
          <span className="text-sm text-ink-3">How it is satisfied</span>
          <input
            className={`${field} ui-mono`}
            value={draft.value}
            onChange={(event) => setDraft({ ...draft, value: event.target.value })}
          />
        </label>

        <label className="block">
          <span className="text-sm text-ink-3">Why it matters</span>
          <textarea
            rows={3}
            className="mt-1.5 w-full resize-none rounded-md border border-line bg-plane p-2.5 text-base outline-none focus:border-accent"
            value={draft.detail}
            onChange={(event) => setDraft({ ...draft, detail: event.target.value })}
          />
        </label>
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-line-soft px-4 py-3">
        <Button variant="primary" icon="check" onClick={() => onSave(draft)}>
          Save
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </footer>
    </Sheet>
  );
};

const destinations = [
  { project: 'Commerce app', suite: 'Checkout' },
  { project: 'Commerce app', suite: 'Cart' },
  { project: 'Commerce app', suite: 'Account' },
  { project: 'Admin console', suite: 'Billing' },
];

/** Moving a test is a two-part choice, so it gets a list rather than a menu. */
export const MoveSheet = ({
  current,
  onMove,
  onClose,
}: {
  current: { project: string; suite: string };
  onMove: (destination: { project: string; suite: string }) => void;
  onClose: () => void;
}) => (
  <Sheet title="Move test" subtitle={`${current.project} · ${current.suite}`} onClose={onClose}>
    <ul className="p-2">
      {destinations.map((destination) => {
        const here = destination.project === current.project && destination.suite === current.suite;
        return (
          <li key={`${destination.project}/${destination.suite}`}>
            <button
              type="button"
              disabled={here}
              onClick={() => onMove(destination)}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-base ${
                here ? 'text-ink-3' : 'hover:bg-raised'
              }`}
            >
              <Icon name="suite" size={14} className="text-ink-3" />
              <span className="truncate">
                {destination.project} <span className="text-ink-3">·</span> {destination.suite}
              </span>
              {here && <span className="ml-auto text-xs text-ink-3">current</span>}
            </button>
          </li>
        );
      })}
    </ul>
  </Sheet>
);

/** Soft delete: says where the test goes and how to get it back. */
export const DeleteSheet = ({
  name,
  onDelete,
  onClose,
}: {
  name: string;
  onDelete: () => void;
  onClose: () => void;
}) => (
  <Sheet title="Move to trash" onClose={onClose}>
    <div className="px-4 py-4 text-base leading-6 text-ink-2">
      <p>
        <span className="text-ink">{name}</span> stops running in every environment and leaves the
        suite. Its recorded steps, spec and run history are kept.
      </p>
      <p className="mt-2 text-ink-3">Restore it from the trash within 30 days.</p>
    </div>
    <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
      <Button variant="primary" icon="trash" onClick={onDelete}>
        Move to trash
      </Button>
      <Button variant="ghost" onClick={onClose}>
        Cancel
      </Button>
    </footer>
  </Sheet>
);
