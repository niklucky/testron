import { useTranslation } from '@warpunit/slang-react';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

import type { SessionMenuId } from '../../preload/app-command';
import type { VerifyAssertion } from '../../preload/api';
import { Badge, Button, Icon, IconButton, Kbd, PulseDot } from '../design';
import { clock } from './codegen';
import { displayRecordShortcut } from './hotkeys';
import type { CaptureMode, PanelId, RecordStatus } from './types';

/**
 * Row one: where you are. Project, suite, environment and the test being
 * recorded — the chain the user walked to get here, kept visible because a
 * recording aimed at the wrong environment is only discovered much later.
 */
export const SessionBar = ({
  status,
  elapsed,
  steps,
  onBack,
  project,
  projects,
  projectId,
  onProject,
  suite,
  suites,
  suiteId,
  onSuite,
  environment,
  environments,
  environmentId,
  onEnvironment,
  profile,
  profiles,
  profileId,
  onProfile,
  onConfigureProfile,
  test,
  onTestEdit,
}: {
  status: RecordStatus;
  elapsed: number;
  steps: number;
  onBack: () => void;
  project: string;
  projects: Array<{ id: string; name: string }>;
  projectId?: string;
  onProject: (id: string) => void;
  suite: string;
  suites: Array<{ id: string; name: string }>;
  suiteId?: string;
  onSuite: (id: string) => void;
  environment: string;
  environments: Array<{ id: string; name: string }>;
  environmentId?: string;
  onEnvironment: (id: string) => void;
  profile?: string;
  profiles: Array<{ id: string; name: string }>;
  profileId?: string;
  onProfile: (id: string) => void;
  onConfigureProfile: () => void;
  test: string;
  onTestEdit: () => void;
}) => {
  const { t } = useTranslation();

  return (
    <>
      <header className="relative z-50 flex h-11 shrink-0 items-center gap-2 border-b border-line bg-plane px-3">
        <div className="desktop-window-drag h-full w-[74px] shrink-0" />

        <div className="desktop-window-controls flex min-w-0 items-center gap-1.5">
          <IconButton
            icon="arrowLeft"
            size="sm"
            label={t('back_to_the_dashboard')}
            onClick={onBack}
          />
          <SessionMenu
            menu="project"
            aria-label={t('recording_project')}
            value={projectId ?? ''}
            label={projects.find((entry) => entry.id === projectId)?.name ?? project}
            options={projects}
            onSelect={onProject}
          />
          <Icon name="chevron" size={12} className="shrink-0 text-ink-3" />
          <SessionMenu
            menu="suite"
            aria-label={t('recording_test_suite')}
            value={suiteId ?? ''}
            label={
              suites.find((entry) => entry.id === suiteId)?.name ??
              (suites.length ? t('choose_test_suite') : suite)
            }
            options={[{ id: '', name: t('choose_test_suite') }, ...suites]}
            onSelect={onSuite}
          />
          <Icon name="chevron" size={12} className="shrink-0 text-ink-3" />
          <SessionMenu
            menu="environment"
            aria-label={t('recording_environment')}
            value={environmentId ?? ''}
            label={environments.find((entry) => entry.id === environmentId)?.name ?? environment}
            options={environments}
            icon={<Icon name="grid" size={13} />}
            onSelect={onEnvironment}
          />
          <Icon name="chevron" size={12} className="shrink-0 text-ink-3" />
          <SessionMenu
            menu="profile"
            aria-label={t('recording_profile')}
            value={profileId ?? ''}
            label={profiles.find((entry) => entry.id === profileId)?.name ?? t('no_profile')}
            options={profiles}
            prefix={t('profile')}
            onSelect={onProfile}
          />
          <IconButton
            icon="pencil"
            size="sm"
            label={profile ? `Configure ${profile}` : t('create_authentication_profile')}
            className="desktop-window-controls"
            onClick={onConfigureProfile}
          />
          <Icon name="chevron" size={12} className="shrink-0 text-ink-3" />
          <Button
            variant="ghost"
            size="sm"
            icon="pencil"
            className="desktop-window-controls min-w-0"
            onClick={onTestEdit}
          >
            <span className="truncate">{test}</span>
          </Button>
        </div>

        <div className="desktop-window-controls ml-auto flex shrink-0 items-center gap-2">
          {status !== 'idle' && (
            <span className="flex items-center gap-2 rounded-md border border-line bg-surface px-2 py-1">
              {status === 'recording' ? (
                <PulseDot tone="critical" label={t('recording')} />
              ) : (
                <span className="h-[7px] w-[7px] rounded-full bg-neutral" />
              )}
              <span className="ui-mono text-sm text-ink-2">{clock(elapsed)}</span>
              <span className="text-sm text-ink-3">
                · {steps} {t('step')}
                {steps === 1 ? '' : t('s')}
              </span>
            </span>
          )}
        </div>
      </header>
    </>
  );
};

/** Electron owns the popup so it can composite above the tested-site view. */
const SessionMenu = ({
  menu,
  'aria-label': ariaLabel,
  value,
  label,
  options,
  prefix,
  icon,
  onSelect,
}: {
  menu: SessionMenuId;
  'aria-label': string;
  value: string;
  label: string;
  options: Array<{ id: string; name: string }>;
  prefix?: string;
  icon?: ReactNode;
  onSelect: (id: string) => void;
}) => {
  const hosted = typeof window.testron !== 'undefined';
  const useDomMenu = !hosted || (menu === 'profile' && options.length === 1);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside, true);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside, true);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (useDomMenu) return;
    return window.testron?.onSessionMenuSelect((selection) => {
      if (selection.menu === menu) onSelect(selection.id);
    });
  }, [menu, onSelect, useDomMenu]);

  const contents = (
    <>
      {icon}
      {prefix && <span className="text-ink-3">{prefix}</span>}
      <span className="truncate">{label}</span>
      <Icon name="caret" size={12} className="shrink-0 text-ink-3" />
    </>
  );

  return (
    <div ref={menuRef} className="desktop-window-controls relative min-w-0 max-w-44">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={useDomMenu ? open : undefined}
        disabled={options.length === 0}
        className="desktop-window-controls flex w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-sm text-ink-2 hover:bg-raised"
        onClick={(event) => {
          if (useDomMenu) {
            setOpen((current) => !current);
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          window.testron.command({
            type: 'show-session-menu',
            menu,
            items: options,
            selectedId: value,
            x: Math.round(rect.left),
            y: Math.round(rect.bottom + 4),
          });
        }}
      >
        {contents}
      </button>
      {useDomMenu && open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className="absolute top-[calc(100%+4px)] left-0 z-50 min-w-full overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-xl"
        >
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={option.id === value}
              className={`flex w-full items-center gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-left text-sm hover:bg-raised ${
                option.id === value ? 'text-accent' : 'text-ink-2'
              }`}
              onClick={() => {
                onSelect(option.id);
                setOpen(false);
              }}
            >
              <span className="w-3">{option.id === value ? '✓' : ''}</span>
              {option.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Row two: the browser, then the recorder, then the panels — left to right in
 * the order you use them. The three groups are separated by rules rather than
 * gaps so a crowded toolbar still parses at a glance.
 */
export const BrowserBar = ({
  url,
  onUrl,
  inputRef,
  loading,
  onNavigate,
  status,
  mode,
  onMode,
  assertion,
  onAssertion,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onRecord,
  onPause,
  onFinish,
  steps,
  editingExisting = false,
  panels,
  onPanel,
}: {
  url: string;
  onUrl: (url: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  loading: boolean;
  onNavigate: (action: 'back' | 'forward' | 'reload' | 'stop') => void;
  status: RecordStatus;
  mode: CaptureMode;
  onMode: (mode: CaptureMode) => void;
  assertion: VerifyAssertion;
  onAssertion: (assertion: VerifyAssertion) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onRecord: () => void;
  onPause: () => void;
  onFinish: () => void;
  steps: number;
  editingExisting?: boolean;
  panels: Record<PanelId, boolean>;
  onPanel: (panel: PanelId) => void;
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(url);
  useEffect(() => setDraft(url), [url]);
  const recording = status === 'recording';

  return (
    <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line px-3">
      <IconButton icon="arrowLeft" label={t('back')} onClick={() => onNavigate('back')} />
      <IconButton icon="arrowRight" label={t('forward')} onClick={() => onNavigate('forward')} />
      <IconButton
        icon={loading ? 'stop' : 'rerun'}
        label={loading ? t('stop_loading') : t('reload')}
        onClick={() => onNavigate(loading ? 'stop' : 'reload')}
      />

      <form
        className="mx-1 flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-line bg-plane px-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          onUrl(draft);
        }}
      >
        <Icon name="lock" size={12} className="shrink-0 text-good" />
        <input
          ref={inputRef}
          aria-label={t('address')}
          value={draft}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => setDraft(url)}
          className="ui-mono min-w-0 flex-1 bg-transparent text-base text-ink outline-none"
        />
        <Kbd className="shrink-0">{displayRecordShortcut('address')}</Kbd>
      </form>

      <span className="mx-1 h-5 w-px shrink-0 bg-line" />

      <IconButton icon="undo" label={t('undo_last_step')} disabled={!canUndo} onClick={onUndo} />
      <IconButton icon="redo" label={t('redo')} disabled={!canRedo} onClick={onRedo} />

      <span className="mx-1 h-5 w-px shrink-0 bg-line" />

      {status === 'idle' || status === 'paused' ? (
        <Button
          variant="primary"
          icon="record"
          onClick={onRecord}
          kbd={displayRecordShortcut('record')}
        >
          {status === 'paused'
            ? t('resume')
            : editingExisting
              ? t('continue_recording')
              : t('record')}
        </Button>
      ) : (
        <Button icon="pause" onClick={onPause} kbd={displayRecordShortcut('record')}>
          {t('pause')}
        </Button>
      )}
      <Button icon="check" onClick={onFinish} disabled={steps === 0 || status === 'finished'}>
        {t('finish')}
      </Button>
      <Button
        icon="eye"
        pressed={mode === 'assert'}
        tone="good"
        disabled={!recording}
        kbd={displayRecordShortcut('assert')}
        onClick={() => onMode(mode === 'assert' ? 'act' : 'assert')}
      >
        {t('assert')}
      </Button>
      {mode === 'assert' && (
        <select
          aria-label={t('assertion_type')}
          value={assertion}
          onChange={(event) => onAssertion(event.target.value as VerifyAssertion)}
          className="h-8 max-w-40 rounded-md border border-line bg-plane px-2 text-sm text-ink outline-none focus:border-accent"
        >
          <option value="visible">{t('visible')}</option>
          <option value="hidden">{t('hidden')}</option>
          <option value="textContains">{t('text_contains')}</option>
          <option value="textEquals">{t('text_equals')}</option>
          <option value="value">{t('input_value')}</option>
          <option value="enabled">{t('enabled')}</option>
          <option value="disabled">{t('disabled')}</option>
          <option value="checked">{t('checked')}</option>
          <option value="unchecked">{t('unchecked')}</option>
          <option value="countExactly">{t('count_exactly')}</option>
          <option value="countAtLeast">{t('count_at_least')}</option>
        </select>
      )}

      <span className="mx-1 h-5 w-px shrink-0 bg-line" />

      <Button
        icon="panelLeft"
        pressed={panels.steps}
        onClick={() => onPanel('steps')}
        kbd={displayRecordShortcut('stepsPanel')}
      >
        {t('test_steps')}
      </Button>
      <Button
        icon="panelRight"
        pressed={panels.code}
        onClick={() => onPanel('code')}
        kbd={displayRecordShortcut('codePanel')}
      >
        {t('auto_test')}
      </Button>
      {status === 'finished' && (
        <Badge tone="good" icon="check" className="ml-1">
          {t('saved')}
        </Badge>
      )}
    </div>
  );
};
