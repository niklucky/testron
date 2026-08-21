import { useTranslation } from '@warpunit/slang-react';
import { useEffect, useState, type ReactNode, type RefObject } from 'react';

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
  onMenuOpenChange,
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
  onMenuOpenChange: (open: boolean) => void;
  test: string;
  onTestEdit: () => void;
}) => {
  const { t } = useTranslation();
  const [openMenu, setOpenMenu] = useState<'project' | 'suite' | 'environment' | 'profile'>();
  const setMenu = (menu: typeof openMenu) => {
    onMenuOpenChange(Boolean(menu));
    setOpenMenu(menu);
  };

  useEffect(() => {
    if (!openMenu) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(undefined);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [openMenu]);

  return (
    <>
      <header
        className="relative z-50 flex h-11 shrink-0 items-center gap-2 border-b border-line bg-plane px-3"
        onKeyDownCapture={(event) => {
          if (event.key === 'Escape' && openMenu) {
            event.preventDefault();
            setMenu(undefined);
          }
        }}
      >
        <div className="desktop-window-drag h-full w-[74px] shrink-0" />

        <div className="desktop-window-controls flex min-w-0 items-center gap-1.5">
          <IconButton
            icon="arrowLeft"
            size="sm"
            label={t('back_to_the_dashboard')}
            onClick={onBack}
          />
          <SessionMenu
            aria-label={t('recording_project')}
            open={openMenu === 'project'}
            value={projectId ?? ''}
            label={projects.find((entry) => entry.id === projectId)?.name ?? project}
            options={projects}
            onOpen={() => setMenu(openMenu === 'project' ? undefined : 'project')}
            onSelect={(id) => {
              onProject(id);
              setMenu(undefined);
            }}
          />
          <Icon name="chevron" size={12} className="shrink-0 text-ink-3" />
          <SessionMenu
            aria-label={t('recording_test_suite')}
            open={openMenu === 'suite'}
            value={suiteId ?? ''}
            label={
              suites.find((entry) => entry.id === suiteId)?.name ??
              (suites.length ? t('choose_test_suite') : suite)
            }
            options={[{ id: '', name: t('choose_test_suite') }, ...suites]}
            onOpen={() => setMenu(openMenu === 'suite' ? undefined : 'suite')}
            onSelect={(id) => {
              onSuite(id);
              setMenu(undefined);
            }}
          />
          <Icon name="chevron" size={12} className="shrink-0 text-ink-3" />
          <SessionMenu
            aria-label={t('recording_environment')}
            open={openMenu === 'environment'}
            value={environmentId ?? ''}
            label={environments.find((entry) => entry.id === environmentId)?.name ?? environment}
            options={environments}
            icon={<Icon name="grid" size={13} />}
            onOpen={() => setMenu(openMenu === 'environment' ? undefined : 'environment')}
            onSelect={(id) => {
              onEnvironment(id);
              setMenu(undefined);
            }}
          />
          <Icon name="chevron" size={12} className="shrink-0 text-ink-3" />
          <SessionMenu
            aria-label={t('recording_profile')}
            open={openMenu === 'profile'}
            value={profileId ?? ''}
            label={profiles.find((entry) => entry.id === profileId)?.name ?? t('no_profile')}
            options={[{ id: '', name: t('no_profile') }, ...profiles]}
            prefix={t('profile')}
            onOpen={() => setMenu(openMenu === 'profile' ? undefined : 'profile')}
            onSelect={(id) => {
              onProfile(id);
              setMenu(undefined);
            }}
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
      {openMenu && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close session menu"
          className="desktop-window-controls fixed inset-0 z-40 cursor-default"
          onClick={() => setMenu(undefined)}
        />
      )}
    </>
  );
};

const SessionMenu = ({
  'aria-label': ariaLabel,
  open,
  value,
  label,
  options,
  prefix,
  icon,
  onOpen,
  onSelect,
}: {
  'aria-label': string;
  open: boolean;
  value: string;
  label: string;
  options: Array<{ id: string; name: string }>;
  prefix?: string;
  icon?: ReactNode;
  onOpen: () => void;
  onSelect: (id: string) => void;
}) => (
  <div className="relative">
    <button
      type="button"
      aria-label={ariaLabel}
      aria-haspopup="listbox"
      aria-expanded={open}
      className="desktop-window-controls flex max-w-44 items-center gap-1 rounded-md px-1.5 py-1 text-sm text-ink-2 hover:bg-raised"
      onClick={onOpen}
    >
      {icon}
      {prefix && <span className="text-ink-3">{prefix}</span>}
      <span className="truncate">{label}</span>
      <Icon name="caret" size={12} className="shrink-0 text-ink-3" />
    </button>
    {open && (
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
            onClick={() => onSelect(option.id)}
          >
            <span className="w-3">{option.id === value ? '✓' : ''}</span>
            {option.name}
          </button>
        ))}
      </div>
    )}
  </div>
);

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
