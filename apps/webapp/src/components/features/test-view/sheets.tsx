import { useTranslation } from '@warpunit/slang-react';
import { useState, type ReactNode } from 'react';

import { Badge, Button, IconButton, Kbd } from '../../ui/design';
import { sourceText, type CodeLine } from '../record/codegen';
import { CodePanel } from '../record/CodePanel';
import { displayTestViewShortcut } from './hotkeys';
import type { Prerequisite } from './types';

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
}) => {
  const { t } = useTranslation();
  return (
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
            {subtitle && <p className="mt-0.5 truncate text-ink-3">{subtitle}</p>}
          </div>
          <IconButton
            icon="close"
            size="sm"
            label={t('close')}
            className="ml-auto"
            onClick={onClose}
          />
        </header>
        {children}
      </section>
    </div>
  );
};

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
  const { t } = useTranslation();
  const content = (
    <>
      <header className="flex shrink-0 items-start gap-3 border-b border-line-soft px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-md font-semibold">{t('auto_test_source')}</h2>
          <p className="mt-0.5 truncate text-ink-3">{file}</p>
        </div>
        {layout === 'modal' && (
          <Kbd className="ml-auto">{displayTestViewShortcut('closeSource')}</Kbd>
        )}
        <IconButton
          icon="close"
          size="sm"
          label={t('close')}
          className={layout === 'modal' ? '' : 'ml-auto'}
          onClick={onClose}
        />
      </header>
      <div className="ui-scroll min-h-0 flex-1 overflow-auto border-b border-line-soft bg-plane">
        {detached ? (
          <textarea
            aria-label={t('test_source')}
            value={source}
            spellCheck={false}
            onChange={(event) => onSource(event.target.value)}
            className="ui-mono h-[420px] w-full resize-none bg-transparent p-3 leading-[19px] text-ink outline-none"
          />
        ) : (
          <CodePanel lines={lines} onSelectStep={() => undefined} />
        )}
      </div>

      <footer className="flex shrink-0 items-center gap-2 px-4 py-3">
        {detached ? (
          <>
            <Badge tone="warning" icon="alert">
              {t('detached')}
            </Badge>
            <span className="text-ink-3">{t('board_edits_no_longer_reach_this_file')}</span>
            <Button
              className="ml-auto"
              icon="rerun"
              onClick={() => {
                onReattach();
                onLog('Source regenerated from the board · hand edits discarded');
              }}
            >
              {t('regenerate_from_board')}
            </Button>
          </>
        ) : (
          <>
            <Badge tone="good" icon="check">
              {t('in_sync')}
            </Badge>
            <span className="text-ink-3">{t('regenerated_from_the_board_on_every_edit')}</span>
            <Button
              className="ml-auto"
              icon="copy"
              onClick={() => {
                if (onCopy) onCopy();
                else void navigator.clipboard?.writeText(sourceText(lines));
                onLog('Spec copied to the clipboard');
              }}
            >
              {t('copy')}
            </Button>
            {canDetach && (
              <Button
                icon="pencil"
                onClick={() => {
                  onDetach();
                  onLog('Source detached · the board no longer regenerates it');
                }}
              >
                {t('edit_by_hand')}
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
        aria-label={t('auto_test_source')}
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
        aria-label={t('auto_test_source')}
        className="flex h-full min-h-0 w-full flex-col rounded-xl border border-line bg-surface shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {content}
      </section>
    </div>
  );
};

/** Add or edit one string prerequisite. */
export const PrerequisiteSheet = ({
  prerequisite,
  onSave,
  onClose,
}: {
  prerequisite: Prerequisite;
  onSave: (prerequisite: Prerequisite) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(prerequisite);
  const field =
    'mt-1.5 h-8 w-full rounded-md border border-line bg-plane px-2.5 outline-none focus:border-accent';

  return (
    <Sheet
      title={t('prerequisite')}
      subtitle={t('satisfied_before_the_first_step_runs')}
      onClose={onClose}
    >
      <div className="px-4 py-4">
        <label className="block">
          <span className="text-ink-3">{t('prerequisite')}</span>
          <input
            autoFocus
            className={field}
            value={draft}
            maxLength={1000}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && draft.trim()) onSave(draft.trim());
            }}
          />
        </label>
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-line-soft px-4 py-3">
        <Button
          variant="primary"
          icon="check"
          disabled={!draft.trim()}
          onClick={() => onSave(draft.trim())}
        >
          {t('save')}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t('cancel')}
        </Button>
      </footer>
    </Sheet>
  );
};

/** Pick the destination project first, then a suite belonging to it. */
export const MoveSheet = ({
  projects,
  testSuites,
  currentProjectId,
  currentTestSuiteId,
  onMove,
  onClose,
}: {
  projects: Array<{ id: string; name: string }>;
  testSuites: Array<{ id: string; projectId: string; name: string }>;
  currentProjectId?: string;
  currentTestSuiteId?: string | null;
  onMove: (destination: { projectId: string; testSuiteId: string }) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [projectId, setProjectId] = useState(currentProjectId ?? projects[0]?.id ?? '');
  const suites = testSuites.filter((suite) => suite.projectId === projectId);
  const [testSuiteId, setTestSuiteId] = useState(
    currentTestSuiteId && suites.some((suite) => suite.id === currentTestSuiteId)
      ? currentTestSuiteId
      : (suites[0]?.id ?? ''),
  );
  return (
    <Sheet title={t('move_test')} onClose={onClose}>
      <div className="grid gap-4 px-4 py-4">
        <label className="grid gap-1.5">
          <span className="text-ink-3">{t('project')}</span>
          <select
            aria-label={t('project')}
            value={projectId}
            onChange={(event) => {
              const nextProjectId = event.target.value;
              setProjectId(nextProjectId);
              setTestSuiteId(
                testSuites.find((suite) => suite.projectId === nextProjectId)?.id ?? '',
              );
            }}
            className="w-full rounded-md border border-line bg-plane px-2.5 py-2 outline-none focus:border-accent"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className="text-ink-3">{t('test_suite')}</span>
          <select
            aria-label={t('test_suite')}
            value={testSuiteId}
            disabled={suites.length === 0}
            onChange={(event) => setTestSuiteId(event.target.value)}
            className="w-full rounded-md border border-line bg-plane px-2.5 py-2 outline-none focus:border-accent disabled:text-ink-3"
          >
            {suites.length === 0 && <option value="">{t('no_test_suite')}</option>}
            {suites.map((suite) => (
              <option key={suite.id} value={suite.id}>
                {suite.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
        <Button
          variant="primary"
          icon="suite"
          disabled={
            !projectId ||
            !testSuiteId ||
            (projectId === currentProjectId && testSuiteId === currentTestSuiteId)
          }
          onClick={() => onMove({ projectId, testSuiteId })}
        >
          {t('move')}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t('cancel')}
        </Button>
      </footer>
    </Sheet>
  );
};

/** Soft delete: says where the test goes and how to get it back. */
export const DeleteSheet = ({
  name,
  onDelete,
  onClose,
}: {
  name: string;
  onDelete: () => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <Sheet title={t('move_to_trash')} onClose={onClose}>
      <div className="px-4 py-4 leading-6 text-ink-2">
        <p>
          <span className="text-ink">{name}</span> stops running in every environment and leaves the
          suite. Its recorded steps, spec and run history are kept.
        </p>
        <p className="mt-2 text-ink-3">{t('restore_it_from_the_trash_within_30_days')}</p>
      </div>
      <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
        <Button variant="primary" icon="trash" onClick={onDelete}>
          {t('move_to_trash')}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t('cancel')}
        </Button>
      </footer>
    </Sheet>
  );
};
