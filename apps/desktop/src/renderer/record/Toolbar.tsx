import { useEffect, useState, type RefObject } from 'react';

import { Badge, Button, Icon, IconButton, Kbd, PulseDot, type Theme } from '../design';
import type { VerifyAssertion } from '../../preload/api';
import { clock } from './codegen';
import type { CaptureMode, PanelId, RecordStatus } from './types';

/**
 * Row one: where you are. Project, suite, environment and the test being
 * recorded — the chain the user walked to get here, kept visible because a
 * recording aimed at the wrong environment is only discovered much later.
 */
export const SessionBar = ({
  status,
  elapsed,
  theme,
  onTheme,
  steps,
  onBack,
  project,
  suite,
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
}: {
  status: RecordStatus;
  elapsed: number;
  /** Owned by the screen: the panel views are told which theme to paint in. */
  theme: Theme;
  onTheme: () => void;
  steps: number;
  onBack: () => void;
  project: string;
  suite: string;
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
}) => {
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3 [-webkit-app-region:drag]">
      <div className="w-[74px] shrink-0" />

      <div className="flex min-w-0 items-center gap-1.5 [-webkit-app-region:no-drag]">
        <IconButton icon="arrowLeft" size="sm" label="Back to the dashboard" onClick={onBack} />
        <Button variant="ghost" size="sm" iconEnd="caret">
          {project}
        </Button>
        <Icon name="chevron" size={12} className="shrink-0 text-ink-3" />
        <Button variant="ghost" size="sm" iconEnd="caret">
          {suite}
        </Button>
        <Icon name="chevron" size={12} className="shrink-0 text-ink-3" />
        <label className="flex items-center gap-1 rounded-md px-1.5 text-sm text-ink-2 hover:bg-raised">
          <Icon name="grid" size={13} />
          <select
            aria-label="Recording environment"
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
          <span className="text-ink-3">Profile</span>
          <select
            aria-label="Recording profile"
            value={profileId ?? ''}
            onChange={(event) => onProfile(event.target.value)}
            className="max-w-36 bg-transparent py-1 outline-none"
          >
            <option value="">{profiles.length ? 'Choose profile' : 'No profile'}</option>
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
          label={profile ? `Configure ${profile}` : 'Create authentication profile'}
          onClick={onConfigureProfile}
        />
        <Icon name="chevron" size={12} className="shrink-0 text-ink-3" />
        <Button variant="ghost" size="sm" icon="pencil" className="min-w-0">
          <span className="truncate">{test}</span>
        </Button>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2 [-webkit-app-region:no-drag]">
        {status !== 'idle' && (
          <span className="flex items-center gap-2 rounded-md border border-line bg-surface px-2 py-1">
            {status === 'recording' ? (
              <PulseDot tone="critical" label="Recording" />
            ) : (
              <span className="h-[7px] w-[7px] rounded-full bg-neutral" />
            )}
            <span className="ui-mono text-sm text-ink-2">{clock(elapsed)}</span>
            <span className="text-sm text-ink-3">
              · {steps} step{steps === 1 ? '' : 's'}
            </span>
          </span>
        )}
        <IconButton
          icon={theme === 'dark' ? 'sun' : 'moon'}
          label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          size="sm"
          onClick={onTheme}
        />
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
  const [draft, setDraft] = useState(url);
  useEffect(() => setDraft(url), [url]);
  const recording = status === 'recording';

  return (
    <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line px-3">
      <IconButton icon="arrowLeft" label="Back" onClick={() => onNavigate('back')} />
      <IconButton icon="arrowRight" label="Forward" onClick={() => onNavigate('forward')} />
      <IconButton
        icon={loading ? 'stop' : 'rerun'}
        label={loading ? 'Stop loading' : 'Reload'}
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
          aria-label="Address"
          value={draft}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => setDraft(url)}
          className="ui-mono min-w-0 flex-1 bg-transparent text-base text-ink outline-none"
        />
        <Kbd className="shrink-0">⌘L</Kbd>
      </form>

      <span className="mx-1 h-5 w-px shrink-0 bg-line" />

      <IconButton icon="undo" label="Undo last step" disabled={!canUndo} onClick={onUndo} />
      <IconButton icon="redo" label="Redo" disabled={!canRedo} onClick={onRedo} />

      <span className="mx-1 h-5 w-px shrink-0 bg-line" />

      {status === 'idle' || status === 'paused' ? (
        <Button variant="primary" icon="record" onClick={onRecord} kbd="R">
          {status === 'paused' ? 'Resume' : editingExisting ? 'Continue recording' : 'Record'}
        </Button>
      ) : (
        <Button icon="pause" onClick={onPause} kbd="R">
          Pause
        </Button>
      )}
      <Button icon="check" onClick={onFinish} disabled={steps === 0 || status === 'finished'}>
        Finish
      </Button>
      <Button
        icon="eye"
        pressed={mode === 'assert'}
        tone="good"
        disabled={!recording}
        kbd="A"
        onClick={() => onMode(mode === 'assert' ? 'act' : 'assert')}
      >
        Assert
      </Button>
      {mode === 'assert' && (
        <select
          aria-label="Assertion type"
          value={assertion}
          onChange={(event) => onAssertion(event.target.value as VerifyAssertion)}
          className="h-8 max-w-40 rounded-md border border-line bg-plane px-2 text-sm text-ink outline-none focus:border-accent"
        >
          <option value="visible">Visible</option>
          <option value="hidden">Hidden</option>
          <option value="textContains">Text contains</option>
          <option value="textEquals">Text equals</option>
          <option value="value">Input value</option>
          <option value="enabled">Enabled</option>
          <option value="disabled">Disabled</option>
          <option value="checked">Checked</option>
          <option value="unchecked">Unchecked</option>
          <option value="countExactly">Count exactly</option>
          <option value="countAtLeast">Count at least</option>
        </select>
      )}

      <span className="mx-1 h-5 w-px shrink-0 bg-line" />

      <Button icon="panelLeft" pressed={panels.steps} onClick={() => onPanel('steps')} kbd="1">
        Test steps
      </Button>
      <Button icon="panelRight" pressed={panels.code} onClick={() => onPanel('code')} kbd="2">
        Auto test
      </Button>
      {status === 'finished' && (
        <Badge tone="good" icon="check" className="ml-1">
          Saved
        </Badge>
      )}
    </div>
  );
};
