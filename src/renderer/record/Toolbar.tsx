import { useEffect, useState, type RefObject } from 'react';

import { Badge, Button, Icon, IconButton, Kbd, PulseDot, type Theme } from '../design';
import { clock } from './codegen';
import { session } from './data';
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
}: {
  status: RecordStatus;
  elapsed: number;
  /** Owned by the screen: the panel views are told which theme to paint in. */
  theme: Theme;
  onTheme: () => void;
  steps: number;
  onBack: () => void;
}) => {
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3 [-webkit-app-region:drag]">
      <div className="w-[74px] shrink-0" />

      <div className="flex min-w-0 items-center gap-1.5 [-webkit-app-region:no-drag]">
        <IconButton icon="arrowLeft" size="sm" label="Back to the dashboard" onClick={onBack} />
        <Button variant="ghost" size="sm" iconEnd="caret">
          {session.project}
        </Button>
        <Icon name="chevron" size={12} className="shrink-0 text-ink-3" />
        <Button variant="ghost" size="sm" iconEnd="caret">
          {session.suite}
        </Button>
        <Icon name="chevron" size={12} className="shrink-0 text-ink-3" />
        <Button variant="ghost" size="sm" iconEnd="caret" icon="grid">
          {session.environment}
        </Button>
        <Icon name="chevron" size={12} className="shrink-0 text-ink-3" />
        <Button variant="ghost" size="sm" icon="pencil" className="min-w-0">
          <span className="truncate">{session.test}</span>
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
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onRecord,
  onPause,
  onFinish,
  steps,
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
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onRecord: () => void;
  onPause: () => void;
  onFinish: () => void;
  steps: number;
  panels: Record<PanelId, boolean>;
  onPanel: (panel: PanelId) => void;
}) => {
  const [draft, setDraft] = useState(url);
  useEffect(() => setDraft(url), [url]);
  const recording = status === 'recording';

  return (
    <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line px-3">
      <IconButton icon="arrowLeft" label="Back" onClick={() => onNavigate('back')} />
      <IconButton
        icon="arrowRight"
        label="Forward"
        disabled
        onClick={() => onNavigate('forward')}
      />
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
          {status === 'paused' ? 'Resume' : 'Record'}
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
