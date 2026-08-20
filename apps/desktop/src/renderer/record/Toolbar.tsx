import { useTranslation } from '@warpunit/slang-react';
import { useEffect, useState, type RefObject } from 'react';

import { Badge, Button, Icon, IconButton, Kbd, PulseDot } from '../design';
import type { VerifyAssertion } from '../../preload/api';
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
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3 [-webkit-app-region:drag]">
      <div className="w-[74px] shrink-0" />

      <div className="flex min-w-0 items-center gap-1.5 [-webkit-app-region:no-drag]">
        <IconButton
          icon="arrowLeft"
          size="sm"
          label={t('back_to_the_dashboard')}
          onClick={onBack}
        />
        <label className="flex items-center rounded-md px-1.5 text-sm text-ink-2 hover:bg-raised">
          <select
            aria-label={t('recording_project')}
            value={projectId ?? ''}
            onChange={(event) => onProject(event.target.value)}
            className="max-w-40 bg-transparent py-1 outline-none"
          >
            {projects.length === 0 && <option value="">{project}</option>}
            {projects.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <Icon name="chevron" size={12} className="shrink-0 text-ink-3" />
        <label className="flex items-center rounded-md px-1.5 text-sm text-ink-2 hover:bg-raised">
          <select
            aria-label={t('recording_test_suite')}
            value={suiteId ?? ''}
            onChange={(event) => onSuite(event.target.value)}
            className="max-w-40 bg-transparent py-1 outline-none"
          >
            <option value="">{suites.length ? t('choose_test_suite') : suite}</option>
            {suites.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <Icon name="chevron" size={12} className="shrink-0 text-ink-3" />
        <label className="flex items-center gap-1 rounded-md px-1.5 text-sm text-ink-2 hover:bg-raised">
          <Icon name="grid" size={13} />
          <select
            aria-label={t('recording_environment')}
            value={environmentId ?? ''}
            onChange={(event) => onEnvironment(event.target.value)}
            className="max-w-36 bg-transparent py-1 outline-none"
          >
            {environments.length === 0 && <option value="">{environment}</option>}
            {environments.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <Icon name="chevron" size={12} className="shrink-0 text-ink-3" />
        <label className="flex items-center gap-1 rounded-md px-1.5 text-sm text-ink-2 hover:bg-raised">
          <span className="text-ink-3">{t('profile')}</span>
          <select
            aria-label={t('recording_profile')}
            value={profileId ?? ''}
            onChange={(event) => onProfile(event.target.value)}
            className="max-w-36 bg-transparent py-1 outline-none"
          >
            <option value="">{t('no_profile')}</option>
            {profiles.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <IconButton
          icon="pencil"
          size="sm"
          label={profile ? `Configure ${profile}` : t('create_authentication_profile')}
          onClick={onConfigureProfile}
        />
        <Icon name="chevron" size={12} className="shrink-0 text-ink-3" />
        <Button variant="ghost" size="sm" icon="pencil" className="min-w-0" onClick={onTestEdit}>
          <span className="truncate">{test}</span>
        </Button>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2 [-webkit-app-region:no-drag]">
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
