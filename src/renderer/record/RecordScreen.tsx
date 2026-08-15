import { useEffect, useMemo, useRef, useState } from 'react';

import type { RecordLayout, RecordPanelEvent } from '../../preload/record';
import { Badge, Button, Icon, IconButton, Kbd, useTheme } from '../design';
import { buildSource, clock, sourceText } from './codegen';
import { CodePanel } from './CodePanel';
import { script, session } from './data';
import { GlassPanel } from './GlassPanel';
import { StepsPanel } from './StepsPanel';
import { TargetPage, type PageState } from './TargetPage';
import { BrowserBar, SessionBar } from './Toolbar';
import type { CaptureMode, PanelId, RecordedStep, RecordStatus } from './types';

/**
 * Recording a test.
 *
 * The window is a browser: chrome on top, the site underneath, and the two
 * readings of the take floating over it on glass. Nothing about the recorder
 * sits between the tester and the page — they drive the site the way a user
 * would, and the panels fill themselves in.
 *
 * Both panels are generated from one step list, so the manual steps and the
 * spec can never drift. Selecting in either lights up the other and points at
 * the element on the page.
 *
 * The screen runs in two hosts. In the packaged app the page is a
 * WebContentsView and the panels are two more, stacked above it: this
 * component then owns the state and *publishes* it, and the plane below is
 * left empty for the native views to fill. Opened in a plain browser — which
 * is how the design is worked on — there are no views, so the same panels and
 * a stand-in page render inline. `hosted` is the only thing that differs.
 *
 * Shell only: `script` in ./data stands in for the recorder until this screen
 * is wired to the live snapshot stream in preload/api.ts.
 */
export const RecordScreen = () => {
  /** True in Electron, where the page and the panels are native views. */
  const hosted = typeof window.testron !== 'undefined';
  const { theme, toggle } = useTheme();
  const [steps, setSteps] = useState<RecordedStep[]>([]);
  const [past, setPast] = useState<RecordedStep[][]>([]);
  const [future, setFuture] = useState<RecordedStep[][]>([]);
  const [status, setStatus] = useState<RecordStatus>('idle');
  const [mode, setMode] = useState<CaptureMode>('act');
  const [elapsed, setElapsed] = useState(0);
  const [url, setUrl] = useState(session.baseUrl);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [expandedId, setExpandedId] = useState<string>();
  const [panels, setPanels] = useState<Record<PanelId, boolean>>({ steps: true, code: true });
  const [widths, setWidths] = useState<Record<PanelId, number>>({ steps: 25, code: 25 });
  /** Set while the finish sheet is open, so "keep recording" picks the take back up. */
  const [finishing, setFinishing] = useState<'from-recording' | 'from-pause'>();
  const [name, setName] = useState(session.test);
  const [log, setLog] = useState('Ready · press Record and drive the page');
  const addressRef = useRef<HTMLInputElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  /** The panel being dragged, whose view is widened to the whole plane. */
  const [resizing, setResizing] = useState<PanelId | null>(null);

  useEffect(() => {
    // The legacy recorder shell's own layout stays parked: from here on the
    // record layout below decides where every view goes.
    window.testron?.command({ type: 'set-shell-route', route: 'dashboard' });
    return () =>
      window.testron?.command({
        type: 'set-record-layout',
        layout: {
          plane: null,
          panels: { steps: { visible: false, width: 25 }, code: { visible: false, width: 25 } },
          resizing: null,
        },
      });
  }, []);

  const commit = (next: RecordedStep[]) => {
    setPast((current) => [...current, steps]);
    setFuture([]);
    setSteps(next);
  };

  const undo = () => {
    const previous = past.at(-1);
    if (!previous) return;
    setPast((current) => current.slice(0, -1));
    setFuture((current) => [steps, ...current]);
    setSteps(previous);
    setLog('Undo · step list rolled back');
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture((current) => current.slice(1));
    setPast((current) => [...current, steps]);
    setSteps(next);
    setLog('Redo');
  };

  // The recorder, stood in for: one scripted interaction lands every 1.6s.
  useEffect(() => {
    if (status !== 'recording') return;
    const next = script[steps.length];
    if (!next) return;
    const timer = window.setTimeout(() => {
      const captured =
        mode === 'assert' && !next.kind.startsWith('assert')
          ? ({ ...next, kind: 'assert', assertion: 'visible' } satisfies RecordedStep)
          : next;
      commit([...steps, captured]);
      setSelectedId(captured.id);
      setExpandedId(undefined);
      setMode('act');
      if (captured.url) setUrl(captured.url);
      setLog(`Captured · ${captured.kind} on ${captured.label}`);
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [status, steps, mode]);

  useEffect(() => {
    if (status !== 'recording') return;
    const timer = window.setInterval(() => setElapsed((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  const record = () => {
    setStatus('recording');
    setLog(steps.length === 0 ? 'Recording · every interaction becomes a step' : 'Resumed');
  };

  const pause = () => {
    setStatus('paused');
    setMode('act');
    setLog('Paused · the page is yours again, nothing is captured');
  };

  const remove = (id: string) => {
    commit(steps.filter((step) => step.id !== id));
    if (selectedId === id) setSelectedId(undefined);
    setLog('Step deleted · the spec regenerated without it');
  };

  const useAlternative = (id: string, locator: string) => {
    commit(
      steps.map((step) =>
        step.id === id
          ? {
              ...step,
              locator,
              alternatives: [step.locator, ...step.alternatives.filter((one) => one !== locator)],
            }
          : step,
      ),
    );
    setLog(`Locator swapped · ${locator}`);
  };

  const navigate = (action: 'back' | 'forward' | 'reload' | 'stop') => {
    if (action === 'stop') {
      setLoading(false);
      setLog('Load stopped');
      return;
    }
    setLoading(true);
    window.setTimeout(() => setLoading(false), 700);
    setLog(`${action[0].toUpperCase()}${action.slice(1)} · ${url}`);
  };

  const goTo = (next: string) => {
    setUrl(next);
    setLoading(true);
    window.setTimeout(() => setLoading(false), 700);
    setLog(`Navigated · ${next}`);
  };

  const togglePanel = (panel: PanelId) =>
    setPanels((current) => ({ ...current, [panel]: !current[panel] }));

  /** The record shortcuts, wherever the keystroke landed — window or panel view. */
  const shortcut = (key: string) => {
    if (key === 'r') {
      if (status === 'recording') pause();
      else record();
    } else if (key === 'a' && status === 'recording') {
      setMode((current) => (current === 'assert' ? 'act' : 'assert'));
    } else if (key === '1') {
      togglePanel('steps');
    } else if (key === '2') {
      togglePanel('code');
    } else if (key === 'f') {
      setPanels((current) =>
        current.steps || current.code ? { steps: false, code: false } : { steps: true, code: true },
      );
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        addressRef.current?.select();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (typing) {
        if (event.key === 'Escape') target.blur();
        return;
      }

      if (event.key === 'Escape') setFinishing(undefined);
      else shortcut(event.key.toLowerCase());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, steps.length]);

  const lines = useMemo(() => buildSource(steps), [steps]);
  const selected = steps.find((step) => step.id === selectedId);

  /**
   * Where the three views belong. The plane is measured rather than computed
   * from the chrome heights, so the toolbar can grow a row without anything in
   * the main process having to hear about it.
   *
   * While the finish sheet is open the plane is surrendered: a dialog drawn in
   * this document cannot appear over a native view, so the views park and the
   * window is ours again for as long as the sheet is up.
   */
  const layout = (): RecordLayout => {
    const rect = finishing ? undefined : planeRef.current?.getBoundingClientRect();
    return {
      plane: rect
        ? {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          }
        : null,
      panels: {
        steps: { visible: panels.steps, width: widths.steps },
        code: { visible: panels.code, width: widths.code },
      },
      resizing,
    };
  };

  const publish = () => {
    if (!hosted) return;
    const current = layout();
    window.testron?.command({ type: 'set-record-layout', layout: current });
    window.testron?.command({
      type: 'publish-record-state',
      state: {
        theme,
        status,
        mode,
        elapsed,
        file: session.file,
        selectedId,
        expandedId,
        steps,
        lines,
        layout: current,
      },
    });
  };

  useEffect(publish, [
    hosted,
    theme,
    status,
    mode,
    elapsed,
    selectedId,
    expandedId,
    steps,
    lines,
    panels,
    widths,
    resizing,
    finishing,
  ]);

  // The plane moves when the window does, and the panels have to follow.
  useEffect(() => {
    if (!hosted) return;
    const onResize = () => publish();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  useEffect(() => {
    if (!hosted) return;
    return window.testron?.onRecordEvent((event: RecordPanelEvent) => {
      switch (event.type) {
        case 'ready':
          publish();
          break;
        case 'select':
          setSelectedId(event.id);
          break;
        case 'expand':
          setExpandedId((current) => (current === event.id ? undefined : event.id));
          break;
        case 'use-alternative':
          useAlternative(event.id, event.locator);
          break;
        case 'delete':
          remove(event.id);
          break;
        case 'close':
          togglePanel(event.panel);
          break;
        case 'resize':
          setWidths((current) => ({ ...current, [event.panel]: event.width }));
          setResizing(event.done ? null : event.panel);
          break;
        case 'copy':
          void navigator.clipboard?.writeText(sourceText(lines));
          setLog('Spec copied to the clipboard');
          break;
        case 'shortcut':
          shortcut(event.key);
          break;
      }
    });
  });

  const pageState: PageState = {
    email: steps.find((step) => step.spot === 'email')?.value,
    address: steps.find((step) => step.spot === 'address')?.value,
    delivery: steps.find((step) => step.kind === 'select')?.value,
    card: steps.find((step) => step.spot === 'pay' && step.kind === 'fill') ? 'set' : undefined,
    save: steps.some((step) => step.kind === 'check'),
    confirmed: steps.some((step) => step.kind === 'click' && step.label === 'Pay now'),
  };

  return (
    <main className="ui-root flex h-screen w-screen flex-col overflow-hidden bg-plane font-sans text-ink antialiased">
      <SessionBar
        status={status}
        elapsed={elapsed}
        theme={theme}
        onTheme={toggle}
        steps={steps.length}
        onBack={() => {
          window.location.hash = '#/';
        }}
      />
      <BrowserBar
        url={url}
        onUrl={goTo}
        inputRef={addressRef}
        loading={loading}
        onNavigate={navigate}
        status={status}
        mode={mode}
        onMode={setMode}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onUndo={undo}
        onRedo={redo}
        onRecord={record}
        onPause={pause}
        onFinish={() => {
          // Capture stops the moment the sheet opens — whatever happens on the
          // page while someone names the test is not part of the take.
          setFinishing(status === 'recording' ? 'from-recording' : 'from-pause');
          if (status === 'recording') pause();
        }}
        steps={steps.length}
        panels={panels}
        onPanel={togglePanel}
      />

      {/* The browser plane. Everything below the chrome belongs to the site;
          the panels sit on top of it rather than taking width from it.
          In the packaged app this rectangle is deliberately left empty — its
          measurements are what the native views are positioned by. */}
      <div ref={planeRef} data-plane className="relative min-h-0 flex-1">
        {!hosted && (
          <TargetPage
            state={pageState}
            active={selected?.spot}
            mode={mode}
            tag={selected?.locator}
            recording={status === 'recording'}
          />
        )}

        {status === 'recording' && !hosted && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-30"
            style={{ boxShadow: 'inset 0 0 0 2px var(--ui-critical)' }}
          />
        )}

        {!hosted && panels.steps && (
          <GlassPanel
            side="left"
            title="Test steps"
            subtitle={`${steps.length} · ${clock(elapsed)}`}
            width={widths.steps}
            onResize={(width) => setWidths((current) => ({ ...current, steps: width }))}
            onClose={() => togglePanel('steps')}
            action={
              mode === 'assert' ? (
                <Badge tone="good" icon="eye" size="sm">
                  Assert
                </Badge>
              ) : undefined
            }
          >
            <StepsPanel
              steps={steps}
              status={status}
              selectedId={selectedId}
              expandedId={expandedId}
              onSelect={setSelectedId}
              onExpand={(id) => setExpandedId((current) => (current === id ? undefined : id))}
              onUseAlternative={useAlternative}
              onDelete={remove}
            />
          </GlassPanel>
        )}

        {!hosted && panels.code && (
          <GlassPanel
            side="right"
            title="Auto test"
            subtitle={session.file.split('/').at(-1)}
            width={widths.code}
            onResize={(width) => setWidths((current) => ({ ...current, code: width }))}
            onClose={() => togglePanel('code')}
            action={
              <IconButton
                icon="copy"
                size="sm"
                label="Copy the spec"
                onClick={() => {
                  void navigator.clipboard?.writeText(sourceText(lines));
                  setLog('Spec copied to the clipboard');
                }}
              />
            }
          >
            <CodePanel lines={lines} selectedId={selectedId} onSelectStep={setSelectedId} />
          </GlassPanel>
        )}

        {finishing && (
          <FinishSheet
            name={name}
            onName={setName}
            steps={steps.length}
            elapsed={elapsed}
            onCancel={() => {
              const resume = finishing === 'from-recording';
              setFinishing(undefined);
              if (resume) record();
            }}
            onSave={() => {
              setFinishing(undefined);
              setStatus('finished');
              setLog(`Saved · ${steps.length} steps → test view`);
            }}
          />
        )}
      </div>

      <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-line px-3 text-sm text-ink-3">
        <span className="ui-mono truncate text-ink-2">{session.file}</span>
        <span className="truncate">{log}</span>
        <span className="ml-auto flex shrink-0 items-center gap-3">
          <span>{lines.length} lines generated</span>
          <span className="ui-mono">{session.testIdAttribute}</span>
          <span>{session.environment}</span>
        </span>
      </footer>
    </main>
  );
};

/** The one blocking moment in the flow: name the take, then hand it on. */
const FinishSheet = ({
  name,
  onName,
  steps,
  elapsed,
  onCancel,
  onSave,
}: {
  name: string;
  onName: (name: string) => void;
  steps: number;
  elapsed: number;
  onCancel: () => void;
  onSave: () => void;
}) => (
  <div
    className="absolute inset-0 z-40 grid place-items-center"
    style={{ background: 'var(--ui-overlay)' }}
  >
    <section
      role="dialog"
      aria-label="Finish recording"
      className="w-[420px] rounded-xl border border-line bg-surface p-5 shadow-2xl"
    >
      <h2 className="text-lg font-semibold">Finish recording</h2>
      <p className="mt-1 text-base text-ink-3">
        {steps} steps over {clock(elapsed)} in {session.environment}. The spec is saved next to the
        suite and opens in the test view.
      </p>

      <label className="mt-4 block">
        <span className="text-sm text-ink-3">Test name</span>
        <input
          value={name}
          onChange={(event) => onName(event.target.value)}
          className="mt-1.5 h-9 w-full rounded-md border border-line bg-plane px-2.5 text-base outline-none focus:border-accent"
        />
      </label>

      <p className="ui-mono mt-3 flex items-center gap-1.5 text-sm text-ink-3">
        <Icon name="test" size={13} />
        {session.file}
      </p>

      <div className="mt-5 flex items-center gap-2">
        <Button variant="primary" icon="check" onClick={onSave}>
          Save and open test
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Keep recording
        </Button>
        <Kbd className="ml-auto">Esc</Kbd>
      </div>
    </section>
  </div>
);
