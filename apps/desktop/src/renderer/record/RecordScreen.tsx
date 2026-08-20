import { useEffect, useMemo, useRef, useState } from 'react';

import type { AppSnapshot, VerifyAssertion } from '../../preload/api';
import type { RecordLayout, RecordPanelEvent } from '../../preload/record';
import { Badge, Button, Icon, IconButton, Kbd, useTheme } from '../design';
import { ProfileSheet } from '../profiles/ProfileSheet';
import { clock, sourceText } from './codegen';
import { convertStepToAssertion } from './assertion';
import { CodePanel } from './CodePanel';
import { GlassPanel } from './GlassPanel';
import { presentRecordedSteps, presentSource, recordingContext } from './live';
import { replacePrimaryLocator } from './locator-edit';
import { StepsPanel } from './StepsPanel';
import { TargetPage, type PageState } from './TargetPage';
import { BrowserBar, SessionBar } from './Toolbar';
import type { CaptureMode, PanelId, RecordStatus } from './types';

const EMPTY_SNAPSHOT: AppSnapshot = {
  title: 'Untitled test',
  recording: false,
  status: 'idle',
  currentUrl: '',
  steps: [],
  descriptions: [],
  source: '',
  captureMode: 'record',
  stepWarnings: [],
  canUndo: false,
  canRedo: false,
  library: {
    projects: [],
    environments: [],
    profiles: [],
    profileVariables: [],
    testSuites: [],
    tests: [],
  },
  replay: { status: 'idle', steps: [] },
  replayHistory: [],
  verifyAssertion: 'visible',
};

/**
 * Recording a test.
 *
 * The window is a browser: chrome on top, the site in the centre, and the two
 * readings of the take docked at its edges. Opening a panel gives it real
 * space and resizes the tested page instead of covering its forms and text.
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
 */
export const RecordScreen = () => {
  /** True in Electron, where the page and the panels are native views. */
  const hosted = typeof window.testron !== 'undefined';
  const { theme, toggle } = useTheme();
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [elapsed, setElapsed] = useState(0);
  const [url, setUrl] = useState('http://127.0.0.1:4174');
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [expandedId, setExpandedId] = useState<string>();
  const [panels, setPanels] = useState<Record<PanelId, boolean>>({ steps: true, code: true });
  const [widths, setWidths] = useState<Record<PanelId, number>>({ steps: 25, code: 25 });
  /** Set while the finish sheet is open, so "keep recording" picks the take back up. */
  const [finishing, setFinishing] = useState<'from-recording' | 'from-pause'>();
  const [configuringProfile, setConfiguringProfile] = useState(false);
  const [name, setName] = useState('Untitled test');
  const [log, setLog] = useState('Ready · press Record and drive the page');
  const addressRef = useRef<HTMLInputElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const stepCountRef = useRef(0);
  /** The panel being dragged, whose view is widened to the whole plane. */
  const [resizing, setResizing] = useState<PanelId | null>(null);
  const [verifyAssertion, setVerifyAssertion] = useState<VerifyAssertion>('visible');

  const steps = useMemo(() => presentRecordedSteps(snapshot.steps), [snapshot.steps]);
  const status: RecordStatus = snapshot.status;
  const mode: CaptureMode = snapshot.captureMode === 'verify' ? 'assert' : 'act';
  const context = useMemo(() => recordingContext(snapshot), [snapshot]);
  const selectedEnvironmentId = snapshot.library.selectedEnvironmentId;
  const environments = snapshot.library.environments.filter(
    (environment) => environment.projectId === snapshot.library.selectedProjectId,
  );
  const profiles = snapshot.library.profiles.filter(
    (profile) => profile.environmentId === selectedEnvironmentId,
  );
  const selectedProfile = profiles.find(
    (profile) => profile.id === snapshot.library.selectedProfileId,
  );
  const lines = useMemo(() => presentSource(snapshot.source, steps), [snapshot.source, steps]);
  const repickingId =
    snapshot.repickIndex === undefined ? undefined : steps[snapshot.repickIndex]?.id;

  useEffect(() => {
    // The legacy recorder shell's own layout stays parked: from here on the
    // record layout below decides where every view goes.
    window.testron?.command({ type: 'set-shell-route', route: 'dashboard' });
    const unsubscribe = window.testron?.onSnapshot(setSnapshot);
    window.testron?.command({ type: 'request-snapshot' });
    return () => {
      unsubscribe?.();
      window.testron?.command({
        type: 'set-record-layout',
        layout: {
          plane: null,
          panels: { steps: { visible: false, width: 25 }, code: { visible: false, width: 25 } },
          resizing: null,
        },
      });
    };
  }, []);

  useEffect(() => {
    if (snapshot.currentUrl) setUrl(snapshot.currentUrl);
    else if (snapshot.library.selectedEnvironmentId) setUrl(context.baseUrl);
  }, [snapshot.currentUrl, snapshot.library.selectedEnvironmentId, context.baseUrl]);

  useEffect(() => {
    setName(context.title);
  }, [snapshot.library.selectedTestId, context.title]);

  useEffect(() => setVerifyAssertion(snapshot.verifyAssertion), [snapshot.verifyAssertion]);

  useEffect(() => {
    if (selectedId && !steps.some((step) => step.id === selectedId)) setSelectedId(undefined);
  }, [selectedId, steps]);

  useEffect(() => {
    if (steps.length > stepCountRef.current) {
      setSelectedId(steps.at(-1)?.id);
      setExpandedId(undefined);
      setLog(`Captured · ${steps.at(-1)?.kind ?? 'step'}`);
    }
    stepCountRef.current = steps.length;
  }, [steps]);

  const undo = () => {
    window.testron?.command({ type: 'undo-step' });
    setLog('Undo · step list rolled back');
  };

  const redo = () => {
    window.testron?.command({ type: 'redo-step' });
    setLog('Redo');
  };

  useEffect(() => {
    if (status !== 'recording') return;
    const timer = window.setInterval(() => setElapsed((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  const record = () => {
    window.testron?.command({
      type: status === 'paused' ? 'resume-recording' : 'start-recording',
      ...(status !== 'paused' && snapshot.library.selectedTestId && steps.length > 0
        ? { append: true }
        : {}),
    });
    if (status === 'idle' || status === 'finished') setElapsed(0);
    setLog(steps.length === 0 ? 'Recording · every interaction becomes a step' : 'Resumed');
  };

  const pause = () => {
    window.testron?.command({ type: 'pause-recording' });
    setLog('Paused · the page is yours again, nothing is captured');
  };

  const remove = (id: string) => {
    const index = steps.findIndex((step) => step.id === id);
    if (index < 0) return;
    window.testron?.command({ type: 'delete-step', index });
    if (selectedId === id) setSelectedId(undefined);
    setLog('Step deleted · the spec regenerated without it');
  };

  const useAlternative = (id: string, locator: string) => {
    const index = steps.findIndex((step) => step.id === id);
    const alternativeIndex = steps[index]?.alternatives.indexOf(locator) ?? -1;
    if (index < 0 || alternativeIndex < 0) return;
    window.testron?.command({ type: 'use-alternative-locator', index, alternativeIndex });
    setLog(`Locator swapped · ${locator}`);
  };

  const editLocator = (id: string, locator: string) => {
    const index = steps.findIndex((step) => step.id === id);
    const current = snapshot.steps[index];
    if (index < 0 || !current || !('target' in current)) return;
    const target = replacePrimaryLocator(current.target, locator);
    if (!target) {
      setLog('Locator cannot be empty');
      return;
    }
    window.testron?.command({ type: 'update-step', index, step: { ...current, target } });
    setLog(`Locator saved · ${locator}`);
  };

  const repick = (id: string) => {
    const index = steps.findIndex((step) => step.id === id);
    if (index < 0 || !('target' in snapshot.steps[index])) return;
    window.testron?.command({ type: 'set-repick-step', index });
    setSelectedId(id);
    setLog(`Repick step ${index + 1} · click the correct element in the website`);
  };

  const cancelRepick = () => {
    window.testron?.command({ type: 'set-repick-step' });
    setLog('Repick cancelled');
  };

  const convertToAssertion = (id: string) => {
    const index = steps.findIndex((step) => step.id === id);
    const current = snapshot.steps[index];
    if (index < 0 || !current) return;
    window.testron?.command({
      type: 'update-step',
      index,
      step: convertStepToAssertion(current, snapshot.currentUrl),
    });
    setSelectedId(id);
    setLog(`Step ${index + 1} converted to an assertion`);
  };

  const navigate = (action: 'back' | 'forward' | 'reload' | 'stop') => {
    window.testron?.command({ type: 'browser-navigation', action });
    setLoading(action !== 'stop');
    if (action !== 'stop') window.setTimeout(() => setLoading(false), 700);
    setLog(`${action[0].toUpperCase()}${action.slice(1)} · ${url}`);
  };

  const goTo = (next: string) => {
    try {
      const normalized = new URL(next).toString();
      setUrl(normalized);
      setLoading(true);
      window.testron?.command({ type: 'navigate', url: normalized });
      window.setTimeout(() => setLoading(false), 700);
      setLog(`Navigated · ${normalized}`);
    } catch {
      setLog('Enter a complete HTTP(S) address');
    }
  };

  const setCaptureMode = (next: CaptureMode, assertion: VerifyAssertion = verifyAssertion) => {
    setVerifyAssertion(assertion);
    window.testron?.command({
      type: 'set-capture-mode',
      mode: next === 'assert' ? 'verify' : 'record',
      assertion,
    });
  };

  const togglePanel = (panel: PanelId) =>
    setPanels((current) => ({ ...current, [panel]: !current[panel] }));

  /** The record shortcuts, wherever the keystroke landed — window or panel view. */
  const shortcut = (key: string) => {
    if (key === 'r') {
      if (status === 'recording') pause();
      else record();
    } else if (key === 'a' && status === 'recording') {
      setCaptureMode(mode === 'assert' ? 'act' : 'assert');
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

      if (event.key === 'Escape' && finishing) {
        const resume = finishing === 'from-recording';
        setFinishing(undefined);
        if (resume) window.testron?.command({ type: 'resume-recording' });
      } else shortcut(event.key.toLowerCase());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, steps.length, finishing, mode, verifyAssertion]);

  const selected = steps.find((step) => step.id === selectedId);
  const websiteInset = {
    left: panels.steps ? `${widths.steps}%` : '0%',
    right: panels.code ? `${widths.code}%` : '0%',
  };

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
    const rect =
      finishing || configuringProfile ? undefined : planeRef.current?.getBoundingClientRect();
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
        file: context.file,
        selectedId,
        expandedId,
        repickingId,
        steps,
        lines,
        layout: current,
      },
    });
  };

  const copySource = () => {
    if (hosted) window.testron?.command({ type: 'copy-source' });
    else void navigator.clipboard?.writeText(sourceText(lines));
    setLog('Spec copied to the clipboard');
  };

  useEffect(publish, [
    hosted,
    theme,
    status,
    mode,
    elapsed,
    selectedId,
    expandedId,
    repickingId,
    steps,
    lines,
    panels,
    widths,
    resizing,
    finishing,
    configuringProfile,
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
        case 'edit-locator':
          editLocator(event.id, event.locator);
          break;
        case 'repick':
          repick(event.id);
          break;
        case 'cancel-repick':
          cancelRepick();
          break;
        case 'convert-to-assertion':
          convertToAssertion(event.id);
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
          copySource();
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
        project={context.project}
        suite={context.suite}
        environment={context.environment}
        environments={environments}
        environmentId={selectedEnvironmentId}
        onEnvironment={(environmentId) =>
          window.testron?.command({ type: 'select-environment', environmentId })
        }
        profile={selectedProfile?.name}
        profiles={profiles}
        profileId={snapshot.library.selectedProfileId}
        onProfile={(profileId) => {
          if (profileId) window.testron?.command({ type: 'select-profile', profileId });
        }}
        onConfigureProfile={() => setConfiguringProfile(true)}
        test={name}
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
        onMode={setCaptureMode}
        assertion={verifyAssertion}
        onAssertion={(assertion) => setCaptureMode('assert', assertion)}
        canUndo={snapshot.canUndo}
        canRedo={snapshot.canRedo}
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
        editingExisting={Boolean(snapshot.library.selectedTestId && steps.length > 0)}
        panels={panels}
        onPanel={togglePanel}
      />

      {/* The browser plane is divided into three blocks: optional steps, the
          resized website, and optional generated code. In Electron this outer
          rectangle is measured for the three native views; in the browser
          study the same insets are applied directly. */}
      <div ref={planeRef} data-plane className="relative min-h-0 flex-1">
        {!hosted && (
          <div className="absolute inset-y-0" style={websiteInset}>
            <TargetPage
              state={pageState}
              active={selected?.spot}
              mode={mode}
              tag={selected?.locator}
              recording={status === 'recording'}
            />
          </div>
        )}

        {status === 'recording' && !hosted && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 z-30"
            style={{
              ...websiteInset,
              boxShadow: 'inset 0 0 0 2px var(--ui-critical)',
            }}
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
              repickingId={repickingId}
              onSelect={setSelectedId}
              onExpand={(id) => setExpandedId((current) => (current === id ? undefined : id))}
              onUseAlternative={useAlternative}
              onEditLocator={editLocator}
              onRepick={repick}
              onCancelRepick={cancelRepick}
              onConvertToAssertion={convertToAssertion}
              onDelete={remove}
            />
          </GlassPanel>
        )}

        {!hosted && panels.code && (
          <GlassPanel
            side="right"
            title="Auto test"
            subtitle={context.file.split('/').at(-1)}
            width={widths.code}
            onResize={(width) => setWidths((current) => ({ ...current, code: width }))}
            onClose={() => togglePanel('code')}
            action={<IconButton icon="copy" size="sm" label="Copy the spec" onClick={copySource} />}
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
            environment={context.environment}
            file={context.file}
            onCancel={() => {
              const resume = finishing === 'from-recording';
              setFinishing(undefined);
              if (resume) record();
            }}
            onSave={() => {
              if (!name.trim()) return;
              window.testron?.command({ type: 'save-recording', title: name, baseUrl: url });
              setFinishing(undefined);
              setLog(`Saved · ${steps.length} steps → test view`);
              window.location.hash = '#/test';
            }}
          />
        )}
        {configuringProfile && (
          <ProfileSheet
            environment={context.environment}
            disabled={!selectedEnvironmentId}
            onCancel={() => setConfiguringProfile(false)}
            onSave={(profileName, variables) => {
              if (!selectedEnvironmentId) return;
              window.testron?.command({
                type: 'create-profile',
                environmentId: selectedEnvironmentId,
                name: profileName,
                authenticationType: 'credentials',
                variables,
              });
              setConfiguringProfile(false);
              setLog(`Profile ${profileName} selected · ${variables.length} variables available`);
            }}
          />
        )}
      </div>

      <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-line px-3 text-sm text-ink-3">
        <span className="ui-mono truncate text-ink-2">{context.file}</span>
        <span className="truncate">{log}</span>
        <span className="ml-auto flex shrink-0 items-center gap-3">
          <span>{lines.length} lines generated</span>
          <span className="ui-mono">{context.testIdAttribute}</span>
          <span>{context.environment}</span>
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
  environment,
  file,
  onCancel,
  onSave,
}: {
  name: string;
  onName: (name: string) => void;
  steps: number;
  elapsed: number;
  environment: string;
  file: string;
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
        {steps} steps over {clock(elapsed)} in {environment}. The spec is saved next to the suite
        and opens in the test view.
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
        {file}
      </p>

      <div className="mt-5 flex items-center gap-2">
        <Button variant="primary" icon="check" onClick={onSave} disabled={!name.trim()}>
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
