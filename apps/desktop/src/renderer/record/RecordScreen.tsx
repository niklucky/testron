import { useHotkeys } from '@tanstack/react-hotkeys';
import { useTranslation } from '@warpunit/slang-react';
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';

import type { AppSnapshot, VerifyAssertion } from '../../preload/api';
import type { RecordLayout, RecordPanelEvent } from '../../preload/record';
import { TESTED_WEBSITE_PARTITION } from '../../main/security';
import { NewTestForm } from '../dashboard/NewTestForm';
import { Badge, Button, Icon, IconButton, Kbd, useTheme } from '../design';
import { ProfileSheet } from '../profiles/ProfileSheet';
import { convertStepToAssertion } from './assertion';
import { clock, sourceText } from './codegen';
import { CodePanel } from './CodePanel';
import { GlassPanel } from './GlassPanel';
import {
  createRecordHotkeyDefinitions,
  displayRecordShortcut,
  recordShortcutIdForKey,
  runRecordShortcut,
  type RecordHotkeyActions,
} from './hotkeys';
import { presentRecordedSteps, presentSource, recordingContext } from './live';
import { replacePrimaryLocator } from './locator-edit';
import { StepsPanel } from './StepsPanel';
import { TargetPage, type PageState } from './TargetPage';
import { BrowserBar, SessionBar } from './Toolbar';
import type { CaptureMode, PanelId, RecordStatus, StepViewMode } from './types';

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
  browserInstallation: {
    status: 'checking',
    installPath: '',
    estimatedDownloadBytes: 300 * 1024 * 1024,
  },
  verifyAssertion: 'visible',
};

const parkedRecordLayout = (): RecordLayout => ({
  plane: null,
  panels: { steps: { visible: false, width: 25 }, code: { visible: false, width: 25 } },
  resizing: null,
});

const TestedWebsite = 'webview' as unknown as ComponentType<{
  src: string;
  className: string;
  partition: string;
}>;

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
 * In Electron the tested site is an isolated webview inside this renderer's
 * DOM. In a plain browser, where webview is unavailable, a stand-in page is
 * rendered instead. The panels always live in this document so menus and
 * dialogs participate in the same hit-testing and stacking tree.
 *
 */
export const RecordScreen = () => {
  const { t } = useTranslation();
  const hosted = typeof window.testron !== 'undefined';
  const { theme } = useTheme();
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [elapsed, setElapsed] = useState(0);
  // Do not mount the webview until the snapshot or an explicit navigation
  // supplies a target. A fixture fallback here can finish loading after the
  // selected environment URL and incorrectly win the navigation race.
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [expandedId, setExpandedId] = useState<string>();
  const [stepViewMode, setStepViewMode] = useState<StepViewMode>('tester');
  const [panels, setPanels] = useState<Record<PanelId, boolean>>({ steps: true, code: true });
  const [widths, setWidths] = useState<Record<PanelId, number>>({ steps: 25, code: 25 });
  /** Set while the finish sheet is open, so "keep recording" picks the take back up. */
  const [finishing, setFinishing] = useState<'from-recording' | 'from-pause'>();
  const [configuringProfile, setConfiguringProfile] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
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
  const mode: CaptureMode =
    snapshot.captureMode === 'verify'
      ? 'assert'
      : snapshot.captureMode === 'hover'
        ? 'hover'
        : 'act';
  const context = useMemo(() => recordingContext(snapshot), [snapshot]);
  const selectedEnvironmentId = snapshot.library.selectedEnvironmentId;
  const projectEnvironments = snapshot.library.environments.filter(
    (environment) => environment.projectId === snapshot.library.selectedProjectId,
  );
  const selectedLibraryTest = snapshot.library.tests.find(
    (test) => test.id === snapshot.library.selectedTestId,
  );
  const environments = selectedLibraryTest
    ? projectEnvironments.filter((environment) =>
        selectedLibraryTest.environmentIds.includes(environment.id),
      )
    : projectEnvironments;
  const testSuites = snapshot.library.testSuites.filter(
    (testSuite) => testSuite.projectId === snapshot.library.selectedProjectId,
  );
  const profiles = snapshot.library.profiles.filter((profile) =>
    Boolean(selectedEnvironmentId && profile.environmentIds.includes(selectedEnvironmentId)),
  );
  const selectedProfile = profiles.find(
    (profile) => profile.id === snapshot.library.selectedProfileId,
  );
  const lines = useMemo(() => presentSource(snapshot.source, steps), [snapshot.source, steps]);
  const repickingId =
    snapshot.repickIndex === undefined ? undefined : steps[snapshot.repickIndex]?.id;

  useEffect(() => {
    const unsubscribe = window.testron?.onSnapshot(setSnapshot);
    const unsubscribeTargetUrl = window.testron?.onTargetUrl(setUrl);
    window.testron?.command({ type: 'request-snapshot' });
    return () => {
      unsubscribe?.();
      unsubscribeTargetUrl?.();
      window.testron?.command({
        type: 'set-record-layout',
        layout: parkedRecordLayout(),
      });
    };
  }, []);

  useEffect(() => {
    if (snapshot.currentUrl) setUrl(snapshot.currentUrl);
  }, [snapshot.currentUrl]);

  useEffect(() => {
    if (!snapshot.library.selectedEnvironmentId) return;
    setUrl(context.baseUrl);
    window.testron?.command({ type: 'navigate', url: context.baseUrl });
  }, [snapshot.library.selectedEnvironmentId, context.baseUrl]);

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

  const editAssertion = (id: string, patch: { attributeName?: string; expected: string }): void => {
    const index = steps.findIndex((step) => step.id === id);
    const current = snapshot.steps[index];
    if (index < 0 || !current || current.kind !== 'assertElement') return;

    if (current.assertion.type === 'attribute') {
      const attributeName = patch.attributeName?.trim() || current.assertion.name;
      window.testron?.command({
        type: 'update-step',
        index,
        step: {
          ...current,
          assertion: { type: 'attribute', name: attributeName, expected: patch.expected },
        },
      });
      setLog(`Assertion saved · ${attributeName}`);
      return;
    }

    if (current.assertion.type === 'class') {
      window.testron?.command({
        type: 'update-step',
        index,
        step: { ...current, assertion: { type: 'class', expected: patch.expected } },
      });
      setLog('Assertion saved · class');
    }
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
      mode: next === 'assert' ? 'verify' : next === 'hover' ? 'hover' : 'record',
      assertion,
    });
  };

  const togglePanel = (panel: PanelId) =>
    setPanels((current) => ({ ...current, [panel]: !current[panel] }));

  /** These actions also receive shortcuts forwarded from the tested page. */
  const recordHotkeyActions: RecordHotkeyActions = {
    focusAddress: () => addressRef.current?.select(),
    toggleRecording: () => {
      if (status === 'recording') pause();
      else record();
    },
    toggleAssert: () => {
      if (status === 'recording') setCaptureMode(mode === 'assert' ? 'act' : 'assert');
    },
    toggleHover: () => {
      if (status === 'recording') setCaptureMode(mode === 'hover' ? 'act' : 'hover');
    },
    toggleStepsPanel: () => togglePanel('steps'),
    toggleCodePanel: () => togglePanel('code'),
    toggleFocus: () => {
      setPanels((current) =>
        current.steps || current.code ? { steps: false, code: false } : { steps: true, code: true },
      );
    },
    escape: (event) => {
      if (finishing) {
        const resume = finishing === 'from-recording';
        setFinishing(undefined);
        if (resume) window.testron?.command({ type: 'resume-recording' });
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      )
        target.blur();
    },
  };

  useHotkeys(
    createRecordHotkeyDefinitions(recordHotkeyActions, {
      enabled: !finishing && !configuringProfile && !editingTitle,
      captureModeEnabled: status === 'recording',
      escapeEnabled: !configuringProfile && !editingTitle,
    }),
  );

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
      finishing || configuringProfile || editingTitle
        ? undefined
        : planeRef.current?.getBoundingClientRect();
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
    editingTitle,
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
        case 'edit-assertion':
          editAssertion(event.id, {
            ...(event.attributeName ? { attributeName: event.attributeName } : {}),
            expected: event.expected,
          });
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
          {
            const id = recordShortcutIdForKey(event.key);
            if (id) runRecordShortcut(id, recordHotkeyActions);
          }
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
        steps={steps.length}
        project={context.project}
        projects={snapshot.library.projects}
        projectId={snapshot.library.selectedProjectId}
        onProject={(projectId) => window.testron?.command({ type: 'select-project', projectId })}
        suite={context.suite}
        suites={testSuites}
        suiteId={snapshot.library.selectedTestSuiteId}
        onSuite={(testSuiteId) => {
          if (testSuiteId) window.testron?.command({ type: 'select-test-suite', testSuiteId });
        }}
        environment={context.environment}
        environments={environments}
        environmentId={selectedEnvironmentId}
        onEnvironment={(environmentId) =>
          window.testron?.command({ type: 'select-environment', environmentId })
        }
        profile={selectedProfile?.name}
        profiles={profiles}
        profileId={snapshot.library.selectedProfileId}
        onProfile={(profileId) =>
          window.testron?.command({
            type: 'select-profile',
            ...(profileId ? { profileId } : {}),
          })
        }
        onConfigureProfile={() => {
          window.testron?.command({ type: 'set-record-layout', layout: parkedRecordLayout() });
          setConfiguringProfile(true);
        }}
        test={name}
        onTestEdit={() => {
          window.testron?.command({ type: 'set-record-layout', layout: parkedRecordLayout() });
          setEditingTitle(true);
        }}
        onBack={() => {
          window.testron.command({ type: 'show-product' });
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

      {/* The browser plane is divided into optional steps, the isolated tested
          site, and optional generated code — all in one DOM stacking tree. */}
      <div ref={planeRef} data-plane className="relative min-h-0 flex-1">
        <div className="absolute inset-y-0" style={websiteInset}>
          {hosted ? (
            url ? (
              <TestedWebsite
                src={url}
                className="h-full w-full"
                partition={TESTED_WEBSITE_PARTITION}
              />
            ) : null
          ) : (
            <TargetPage
              state={pageState}
              active={selected?.spot}
              mode={mode}
              tag={selected?.locator}
              recording={status === 'recording'}
            />
          )}
        </div>

        {status === 'recording' && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 z-30"
            style={{
              ...websiteInset,
              boxShadow: 'inset 0 0 0 2px var(--ui-critical)',
            }}
          />
        )}

        {panels.steps && (
          <GlassPanel
            side="left"
            title={t('test_steps')}
            subtitle={t('message_2', { value1: steps.length, value2: clock(elapsed) })}
            width={widths.steps}
            onResize={(width, phase) => {
              setWidths((current) => ({ ...current, steps: width }));
              setResizing(phase === 'end' ? null : 'steps');
            }}
            onClose={() => togglePanel('steps')}
            action={
              mode === 'assert' ? (
                <Badge tone="good" icon="eye" size="sm">
                  {t('assert')}
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
              viewMode={stepViewMode}
              onViewModeChange={setStepViewMode}
              onSelect={setSelectedId}
              onExpand={(id) => setExpandedId((current) => (current === id ? undefined : id))}
              onUseAlternative={useAlternative}
              onEditLocator={editLocator}
              onEditAssertion={editAssertion}
              onRepick={repick}
              onCancelRepick={cancelRepick}
              onConvertToAssertion={convertToAssertion}
              onDelete={remove}
            />
          </GlassPanel>
        )}

        {panels.code && (
          <GlassPanel
            side="right"
            title={t('auto_test')}
            subtitle={context.file.split('/').at(-1)}
            width={widths.code}
            onResize={(width, phase) => {
              setWidths((current) => ({ ...current, code: width }));
              setResizing(phase === 'end' ? null : 'code');
            }}
            onClose={() => togglePanel('code')}
            action={
              <IconButton icon="copy" size="sm" label={t('copy_the_spec')} onClick={copySource} />
            }
          >
            <CodePanel lines={lines} selectedId={selectedId} onSelectStep={setSelectedId} />
          </GlassPanel>
        )}

        {resizing && (
          <div
            aria-hidden
            className="absolute inset-0 z-10 cursor-col-resize"
            data-resize-shield={resizing}
          />
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
              window.testron?.command({ type: 'show-selected-test' });
            }}
          />
        )}
        {configuringProfile && (
          <ProfileSheet
            environment={context.environment}
            profile={
              selectedProfile
                ? {
                    name: selectedProfile.name,
                    authenticationType: selectedProfile.authenticationType,
                    variables: snapshot.library.profileVariables
                      .filter(
                        (variable) =>
                          variable.profileId === selectedProfile.id &&
                          variable.environmentId === selectedEnvironmentId,
                      )
                      .map(({ name, sensitive }) => ({ name, sensitive })),
                  }
                : undefined
            }
            disabled={!selectedEnvironmentId}
            onCancel={() => setConfiguringProfile(false)}
            onSave={(profileName, authenticationType, variables) => {
              if (!selectedEnvironmentId) return;
              if (selectedProfile?.revision)
                window.testron?.command({
                  type: 'update-profile',
                  profileId: selectedProfile.id,
                  environmentId: selectedEnvironmentId,
                  baseRevision: selectedProfile.revision,
                  name: profileName,
                  authenticationType,
                  variables,
                });
              else
                window.testron?.command({
                  type: 'create-profile',
                  environmentId: selectedEnvironmentId,
                  name: profileName,
                  authenticationType,
                  variables,
                });
              setConfiguringProfile(false);
              setLog(`Profile ${profileName} selected · ${variables.length} variables available`);
            }}
          />
        )}
        {editingTitle && (
          <NewTestForm
            initialTitle={name}
            heading="Edit test title"
            submitLabel="Save title"
            environments={projectEnvironments}
            initialEnvironmentIds={
              snapshot.library.tests.find((test) => test.id === snapshot.library.selectedTestId)
                ?.environmentIds
            }
            onClose={() => setEditingTitle(false)}
            onStart={(title, environmentIds) => {
              const testId = snapshot.library.selectedTestId;
              if (testId)
                window.testron?.command({
                  type: 'rename-test',
                  testId,
                  title,
                  environmentIds,
                });
              setName(title);
              setEditingTitle(false);
              setLog(`Renamed test · ${title}`);
            }}
          />
        )}
      </div>

      <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-line px-3 text-ink-3">
        <span className="ui-mono truncate text-ink-2">{context.file}</span>
        <span className="truncate">{log}</span>
        <span className="ml-auto flex shrink-0 items-center gap-3">
          <span>
            {lines.length} {t('lines_generated')}
          </span>
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
}) => {
  const { t } = useTranslation();
  return (
    <div
      className="absolute inset-0 z-40 grid place-items-center"
      style={{ background: 'var(--ui-overlay)' }}
    >
      <section
        role="dialog"
        aria-label={t('finish_recording')}
        className="w-[420px] rounded-xl border border-line bg-surface p-5 text-sm shadow-2xl"
      >
        <h2 className="text-base font-semibold">{t('finish_recording')}</h2>
        <p className="mt-1 text-ink-3">
          {steps} {t('steps_over')} {clock(elapsed)} {t('in_2')} {environment}. The spec is saved
          next to the suite and opens in the test view.
        </p>

        <label className="mt-4 block">
          <span className="text-ink-3">{t('test_name')}</span>
          <input
            value={name}
            onChange={(event) => onName(event.target.value)}
            className="mt-1.5 h-9 w-full rounded-md border border-line bg-plane px-2.5 outline-none focus:border-accent"
          />
        </label>

        <p className="ui-mono mt-3 flex items-center gap-1.5 text-ink-3">
          <Icon name="test" size={13} />
          {file}
        </p>

        <div className="mt-5 flex items-center gap-2">
          <Button variant="primary" icon="check" onClick={onSave} disabled={!name.trim()}>
            {t('save_and_open_test')}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            {t('keep_recording')}
          </Button>
          <Kbd className="ml-auto">{displayRecordShortcut('escape')}</Kbd>
        </div>
      </section>
    </div>
  );
};
