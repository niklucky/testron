import { useTranslation } from '@warpunit/slang-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useHotkeys } from '@tanstack/react-hotkeys';

import type { Step } from '@testron/domain/steps/schema';
import type { DesktopRuntimeState } from '@testron/protocol';
import type { AppSnapshot } from '../../../lib/library';
import {
  Badge,
  Button,
  Icon,
  IconButton,
  PulseDot,
  SegmentedControl,
  StatusDot,
  useTheme,
} from '../../ui/design';
import { NewTestForm } from '../dashboard/NewTestForm';
import { presentSource } from '../record/live';
import { replacePrimaryLocator } from '../record/locator-edit';
import type { RecordedStep, StepViewMode } from '../record/types';
import { Branch, EmptyLane, Flow, Lane } from './Board';
import { BrowserInstallModal } from './BrowserInstallModal';
import {
  AssertionCard,
  DetailCard,
  PrerequisiteCard,
  PrerequisitesEmpty,
  RunCard,
  StepArrow,
  StepCard,
} from './columns';
import { liveTestBoard } from './live';
import { createTestViewHotkeyDefinitions, displayTestViewShortcut } from './hotkeys';
import { DeleteSheet, MoveSheet, PrerequisiteSheet, SourceSheet } from './sheets';
import { assertionsFor } from './spec';
import type { Assertion, AssertionKind, Run, TestDetail } from './types';
import { goToDashboard, goToRecorder } from '../../../lib/navigation';

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

const EMPTY_DESKTOP_RUNTIME: DesktopRuntimeState = {
  replay: { status: 'idle', steps: [] },
  browserInstallation: {
    status: 'checking',
    installPath: '',
    estimatedDownloadBytes: 300 * 1024 * 1024,
  },
};

const isAssertion = (step: Step): boolean => step.kind.startsWith('assert');

/** The persisted test, read left to right from the same snapshot used by the recorder. */
export const TestView = () => {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [loaded, setLoaded] = useState(false);
  const [selectedRun, setSelectedRun] = useState<string>();
  const [stepViewMode, setStepViewMode] = useState<StepViewMode>('tester');
  const [desktopRuntime, setDesktopRuntime] = useState(EMPTY_DESKTOP_RUNTIME);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [newTestOpen, setNewTestOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [prerequisiteEdit, setPrerequisiteEdit] = useState<{
    index: number | null;
    value: string;
  }>();
  const [browserInstallOpen, setBrowserInstallOpen] = useState(false);
  const runAfterInstall = useRef(false);
  const [wideSourceLayout, setWideSourceLayout] = useState(() => window.innerWidth > 1920);
  const [log, setLog] = useState('Loading the selected test…');

  useEffect(() => {
    window.testron?.command({ type: 'set-shell-route', route: 'dashboard' });
    const unsubscribe = window.testron?.onSnapshot((next) => {
      setSnapshot(next);
      setLoaded(true);
    });
    window.testron?.command({ type: 'request-snapshot' });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const desktop = window.testronDesktop;
    if (!desktop) return;
    const unsubscribe = desktop.onRuntimeState(setDesktopRuntime);
    desktop.requestRuntimeState();
    return unsubscribe;
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1921px)');
    const update = () => setWideSourceLayout(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const board = useMemo(() => liveTestBoard(snapshot), [snapshot]);
  const { detail, prerequisites, steps, assertions, runs, fullSteps } = board;
  const lines = useMemo(
    () => presentSource(snapshot.source, fullSteps),
    [snapshot.source, fullSteps],
  );
  const selectedTestId = snapshot.library.selectedTestId;
  const selectedTest = snapshot.library.tests.find((test) => test.id === selectedTestId);
  const testSuites = snapshot.library.testSuites.filter(
    (suite) => suite.projectId === snapshot.library.selectedProjectId,
  );
  const movableProjects = snapshot.library.projects.filter((project) =>
    snapshot.library.environments.some((environment) => environment.projectId === project.id),
  );
  const replay = window.testronDesktop ? desktopRuntime.replay : snapshot.replay;
  const running = replay.status === 'running';
  const selectedReplay = useMemo(() => {
    if (!selectedRun) return replay;
    if (selectedRun.startsWith('server-run-')) return { status: 'idle' as const, steps: [] };
    if (selectedRun === 'current-run') return replay;
    const startedAt = selectedRun.slice('run-'.length);
    return snapshot.replayHistory.find((entry) => entry.startedAt === startedAt) ?? replay;
  }, [replay, selectedRun, snapshot.replayHistory]);

  useEffect(() => {
    if (runs[0]) setSelectedRun(runs[0].id);
  }, [runs[0]?.id]);

  useEffect(() => {
    if (!loaded) return;
    if (!selectedTestId) setLog('No test selected · record a test first');
    else if (replay.status === 'running') setLog(`Running on ${detail.environments[0]}…`);
    else if (replay.status !== 'idle')
      setLog(
        `Run ${replay.status} · ${replay.steps.filter((one) => one.status === 'passed').length}/${replay.steps.length} steps passed`,
      );
    else setLog(`${detail.name} · ${snapshot.steps.length} persisted steps`);
  }, [loaded, selectedTestId, replay, snapshot.steps.length, detail]);

  const originalIndex = (id: string): number => fullSteps.findIndex((step) => step.id === id);

  const updateAction = (displayed: RecordedStep, next: RecordedStep) => {
    const index = originalIndex(displayed.id);
    const current = snapshot.steps[index];
    if (!current) return;
    const target =
      'target' in current && next.locator !== displayed.locator
        ? replacePrimaryLocator(current.target, next.locator)
        : 'target' in current
          ? current.target
          : undefined;
    if ('target' in current && !target) {
      setLog('Locator cannot be empty');
      return;
    }
    let updated: Step;
    switch (current.kind) {
      case 'fill':
        updated = { ...current, target: target!, value: next.value ?? '' };
        break;
      case 'selectOption':
        updated = { ...current, target: target!, value: next.value ?? '' };
        break;
      case 'press':
        updated = { ...current, target: target!, key: next.value || 'Enter' };
        break;
      case 'navigate':
        return;
      case 'click':
      case 'check':
      case 'uncheck':
        updated = { ...current, target: target! };
        break;
      default:
        return;
    }
    window.testron?.command({ type: 'update-step', index, step: updated });
    setLog(`Step ${steps.findIndex((one) => one.id === displayed.id) + 1} saved`);
  };

  const updateAssertion = (displayed: Assertion, next: Assertion) => {
    const index = originalIndex(displayed.id);
    const current = snapshot.steps[index];
    if (!current) return;
    let updated: Step;
    if (current.kind === 'assertUrlPath') {
      updated = { ...current, expected: next.expected.startsWith('/') ? next.expected : '/' };
    } else if (current.kind === 'assertElement') {
      const target =
        next.locator === displayed.locator
          ? current.target
          : replacePrimaryLocator(current.target, next.locator);
      if (!target) {
        setLog('Locator cannot be empty');
        return;
      }
      const assertion = (() => {
        switch (next.kind) {
          case 'textContains':
            return { type: 'text' as const, match: 'contains' as const, expected: next.expected };
          case 'textEquals':
            return { type: 'text' as const, match: 'equals' as const, expected: next.expected };
          case 'value':
            return { type: 'value' as const, expected: next.expected };
          case 'visible':
          case 'hidden':
          case 'enabled':
          case 'disabled':
          case 'checked':
          case 'unchecked':
            return { type: next.kind };
          case 'countExactly':
          case 'countAtLeast':
            return {
              type: 'count' as const,
              operator: next.kind === 'countExactly' ? ('equals' as const) : ('atLeast' as const),
              expected: Math.max(0, Number.parseInt(next.expected) || 0),
            };
          case 'urlPath':
            return current.assertion;
        }
      })();
      updated = { ...current, target, assertion };
    } else return;
    window.testron?.command({ type: 'update-step', index, step: updated });
    setLog('Assertion saved');
  };

  const replaceSteps = (next: Step[], message: string) => {
    window.testron?.command({ type: 'replace-steps', steps: next });
    setLog(message);
  };

  const addAssertion = (action: RecordedStep) => {
    const index = originalIndex(action.id);
    const current = snapshot.steps[index];
    if (!current) return;
    const assertion: Step =
      'target' in current
        ? {
            version: 1,
            kind: 'assertElement',
            target: structuredClone(current.target),
            assertion: { type: 'visible' },
            metadata: { recordedAt: new Date().toISOString() },
          }
        : {
            version: 1,
            kind: 'assertUrlPath',
            expected: (() => {
              try {
                return new URL(
                  snapshot.currentUrl || (current.kind === 'navigate' ? current.url : ''),
                ).pathname;
              } catch {
                return '/';
              }
            })(),
            metadata: { recordedAt: new Date().toISOString() },
          };
    const next = [...snapshot.steps];
    let insertion = index + 1;
    while (insertion < next.length && isAssertion(next[insertion])) insertion += 1;
    next.splice(insertion, 0, assertion);
    replaceSteps(
      next,
      `Assertion added after step ${steps.findIndex((one) => one.id === action.id) + 1}`,
    );
  };

  const moveAssertion = (assertion: Assertion, actionIndex: number, direction: -1 | 1) => {
    const from = originalIndex(assertion.id);
    const targetAction = steps[actionIndex + direction];
    const targetOriginal = targetAction
      ? snapshot.steps[originalIndex(targetAction.id)]
      : undefined;
    if (from < 0 || !targetOriginal) return;
    const next = [...snapshot.steps];
    const [moving] = next.splice(from, 1);
    let insertion = next.indexOf(targetOriginal) + 1;
    while (insertion < next.length && isAssertion(next[insertion])) insertion += 1;
    next.splice(insertion, 0, moving);
    replaceSteps(next, `Assertion moved to step ${actionIndex + direction + 1}`);
  };

  const startRun = () => {
    const desktop = window.testronDesktop;
    if (desktop && selectedTestId && selectedTest) {
      desktop.runTest({
        projectId: selectedTest.projectId,
        environmentId: selectedTest.environmentId,
        testId: selectedTestId,
        environmentVariables: {},
        timeoutMs: 30_000,
        reuseAuthState: false,
      });
    } else {
      window.testron?.command({
        type: 'run-test',
        environmentVariables: {},
        timeoutMs: 30_000,
        reuseAuthState: false,
      });
    }
    setLog(`Starting run on ${detail.environments[0] ?? 'Local'}…`);
  };

  const run = () => {
    if (running) {
      if (window.testronDesktop) window.testronDesktop.cancelRun();
      else window.testron?.command({ type: 'cancel-run' });
      setLog('Cancelling run…');
      return;
    }
    if (window.testronDesktop && desktopRuntime.browserInstallation.status !== 'ready') {
      setBrowserInstallOpen(true);
      return;
    }
    startRun();
  };

  useEffect(() => {
    if (!browserInstallOpen || !runAfterInstall.current) return;
    if (desktopRuntime.browserInstallation.status !== 'ready') return;
    runAfterInstall.current = false;
    setBrowserInstallOpen(false);
    startRun();
  }, [browserInstallOpen, desktopRuntime.browserInstallation.status]);

  const sourceModalOpen = sourceOpen && !wideSourceLayout;
  useHotkeys(
    createTestViewHotkeyDefinitions(
      {
        run,
        toggleSource: () => setSourceOpen((open) => !open),
        edit: goToRecorder,
        closeSource: () => setSourceOpen(false),
      },
      {
        enabled: Boolean(selectedTestId) && !newTestOpen && !sourceModalOpen,
        runEnabled: snapshot.steps.length > 0,
        sourceEnabled: Boolean(selectedTestId) && !newTestOpen,
        closeSource: sourceModalOpen && !newTestOpen,
      },
    ),
  );

  const lastVerdict = runs[0]?.verdict;

  const replacePrerequisites = (next: string[], message: string) => {
    if (!selectedTestId) return;
    window.testron?.command({
      type: 'replace-prerequisites',
      testId: selectedTestId,
      prerequisites: next,
    });
    setLog(message);
  };

  if (loaded && !selectedTestId) {
    return (
      <>
        <main className="ui-root grid h-screen w-screen place-items-center bg-plane font-sans text-ink antialiased">
          <section className="w-[420px] rounded-xl border border-line bg-surface p-6 text-center shadow-xl">
            <Icon name="test" size={28} className="mx-auto text-ink-3" />
            <h1 className="mt-3 text-lg font-semibold">{t('no_test_selected')}</h1>
            <p className="mt-1 text-ink-3">
              {t('record_and_save_a_test_before_opening_its_board')}
            </p>
            <Button
              variant="primary"
              icon="record"
              className="mt-5"
              onClick={() => setNewTestOpen(true)}
            >
              {t('record_a_test')}
            </Button>
          </section>
        </main>
        {newTestOpen && (
          <NewTestForm
            onClose={() => setNewTestOpen(false)}
            onStart={(title) => {
              const projectId = snapshot.library.selectedProjectId;
              const environmentId = snapshot.library.selectedEnvironmentId;
              if (!projectId || !environmentId) return;
              window.testron?.command({
                type: 'create-test',
                projectId,
                environmentId,
                title,
              });
              setNewTestOpen(false);
            }}
          />
        )}
      </>
    );
  }

  return (
    <main className="ui-root flex h-screen w-screen flex-col overflow-hidden bg-plane font-sans text-ink antialiased">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3 [-webkit-app-region:drag]">
        <div className="w-[74px] shrink-0" />
        <div className="flex min-w-0 items-center gap-1.5 [-webkit-app-region:no-drag]">
          <IconButton
            icon="arrowLeft"
            size="sm"
            label={t('back_to_the_dashboard')}
            onClick={goToDashboard}
          />
          <Button variant="ghost" size="sm" iconEnd="caret">
            {detail.project}
          </Button>
          <Icon name="chevron" size={12} className="shrink-0 text-ink-3" />
          <label className="flex items-center rounded-md px-1.5 text-ink-2 hover:bg-raised">
            <select
              aria-label={t('test_suite')}
              value={selectedTest?.testSuiteId ?? snapshot.library.selectedTestSuiteId ?? ''}
              onChange={(event) => {
                const testSuiteId = event.target.value;
                if (!testSuiteId) return;
                window.testron?.command({ type: 'select-test-suite', testSuiteId });
                const firstTest = snapshot.library.tests.find(
                  (test) => test.testSuiteId === testSuiteId,
                );
                if (firstTest)
                  window.testron?.command({ type: 'select-test', testId: firstTest.id });
              }}
              className="max-w-44 bg-transparent py-1 outline-none"
            >
              <option value="">{t('no_test_suite')}</option>
              {testSuites.map((suite) => (
                <option key={suite.id} value={suite.id}>
                  {suite.name}
                </option>
              ))}
            </select>
          </label>
          <Icon name="chevron" size={12} className="shrink-0 text-ink-3" />
          <span className="flex min-w-0 items-center gap-1.5 px-1.5 ">
            <StatusDot
              tone={
                !lastVerdict
                  ? 'neutral'
                  : lastVerdict === 'passed'
                    ? 'good'
                    : lastVerdict === 'failed'
                      ? 'critical'
                      : 'accent'
              }
              label={lastVerdict ? `Last run ${lastVerdict}` : t('never_run')}
            />
            <span className="truncate">{detail.name}</span>
          </span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 [-webkit-app-region:no-drag]">
          <Badge tone="good" icon="check">
            {t('persisted')}
          </Badge>
          {snapshot.library.server?.configured && (
            <>
              <Badge
                tone={
                  snapshot.library.server.status === 'conflicted'
                    ? 'critical'
                    : snapshot.library.server.status === 'offline' ||
                        snapshot.library.server.status === 'error'
                      ? 'warning'
                      : snapshot.library.server.status === 'synced'
                        ? 'good'
                        : 'neutral'
                }
                icon={snapshot.library.server.status === 'conflicted' ? 'alert' : 'check'}
              >
                {snapshot.library.server.status === 'conflicted'
                  ? t('sync_conflict')
                  : snapshot.library.server.status}
              </Badge>
              {snapshot.library.server.authentication === 'signedIn' && (
                <>
                  <Button
                    size="sm"
                    icon="rerun"
                    onClick={() => window.testron?.command({ type: 'sync-now' })}
                  >
                    {t('sync')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      window.testron?.command({ type: 'logout-server' });
                      goToDashboard();
                    }}
                  >
                    {t('sign_out')}
                  </Button>
                </>
              )}
              {snapshot.library.server.authentication === 'signedOut' && (
                <Button size="sm" onClick={goToDashboard}>
                  {t('sign_in')}
                </Button>
              )}
            </>
          )}
          <IconButton
            icon={theme === 'dark' ? 'sun' : 'moon'}
            size="sm"
            label={theme === 'dark' ? t('switch_to_light') : t('switch_to_dark')}
            onClick={toggle}
          />
        </div>
      </header>

      <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line px-3">
        <Button
          variant="primary"
          icon={running ? 'pause' : 'play'}
          disabled={snapshot.steps.length === 0}
          onClick={run}
          kbd={displayTestViewShortcut('run')}
        >
          {running ? t('cancel_run') : `Run on ${detail.environments[0] ?? t('local')}`}
        </Button>
        <Button
          icon="code"
          pressed={sourceOpen}
          onClick={() => setSourceOpen((open) => !open)}
          kbd={displayTestViewShortcut('source')}
        >
          {sourceOpen && wideSourceLayout ? t('hide_source') : t('view_source')}
        </Button>
        <Button icon="pencil" onClick={goToRecorder} kbd={displayTestViewShortcut('edit')}>
          {t('edit_in_recorder')}
        </Button>
        <span className="mx-1 h-5 w-px bg-line" />
        <Button icon="suite" onClick={() => setMoveOpen(true)}>
          {t('move')}
        </Button>
        <Button icon="trash" onClick={() => setDeleteOpen(true)}>
          {t('delete')}
        </Button>
        <span className="ml-auto flex items-center gap-3 text-ink-3">
          {running && <PulseDot tone="accent" label={t('running')} />}
          <span>
            {steps.length} {t('actions')} {assertions.length} {t('assertions')}
          </span>
          <span className="ui-mono">{detail.file}</span>
        </span>
      </div>

      <div
        className={`relative min-h-0 flex-1 ${sourceOpen && wideSourceLayout ? 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : ''}`}
      >
        <div data-testid="test-board" className="ui-scroll h-full min-h-0 min-w-0 overflow-x-auto">
          <div className="flex h-full min-w-max items-stretch px-4 py-3">
            <Lane icon="test" title={t('test')} width={320}>
              <DetailCard
                detail={detail}
                metadataEditable={false}
                onDetail={(next: TestDetail) => {
                  if (!selectedTestId || !next.name.trim() || next.name === detail.name) return;
                  window.testron?.command({
                    type: 'rename-test',
                    testId: selectedTestId,
                    title: next.name,
                  });
                  setLog('Test renamed');
                }}
                onLog={setLog}
              />
            </Lane>
            <Flow />
            <Lane
              icon="clipboard"
              title={t('prerequisites')}
              count={prerequisites.length}
              onAdd={() => setPrerequisiteEdit({ index: null, value: '' })}
              addLabel={t('add')}
            >
              {prerequisites.map((prerequisite, index) => (
                <PrerequisiteCard
                  key={`${index}-${prerequisite}`}
                  prerequisite={prerequisite}
                  onEdit={() => setPrerequisiteEdit({ index, value: prerequisite })}
                  onDelete={() => {
                    replacePrerequisites(
                      prerequisites.filter((_, candidate) => candidate !== index),
                      'Prerequisite deleted',
                    );
                  }}
                />
              ))}
              {prerequisites.length === 0 && <PrerequisitesEmpty />}
            </Lane>
            <Flow />

            <Lane
              icon="steps"
              title={t('steps_2')}
              count={steps.length}
              hint={t('assertions_hint', { count: assertions.length })}
              width={360}
              contentTestId="steps-lane-scroll"
              action={
                <SegmentedControl
                  label={t('step_view')}
                  items={[
                    { id: 'tester', label: t('tester'), icon: 'list' },
                    { id: 'developer', label: t('developer'), icon: 'code' },
                  ]}
                  value={stepViewMode}
                  onChange={setStepViewMode}
                  variant="pill"
                  iconOnly
                />
              }
            >
              {steps.map((step, index) => {
                const branch = assertionsFor(board, index);
                const result = selectedReplay.steps[originalIndex(step.id)];
                return (
                  <div key={step.id}>
                    {index > 0 && <StepArrow />}
                    <StepCard
                      step={step}
                      index={index}
                      locatorEditable
                      viewMode={stepViewMode}
                      failed={result?.status === 'failed'}
                      running={result?.status === 'running'}
                      passed={result?.status === 'passed'}
                      error={result?.error}
                      onStep={(next) => updateAction(step, next)}
                      onRepick={() => {
                        const original = originalIndex(step.id);
                        if (original < 0) return;
                        window.testron?.command({ type: 'set-repick-step', index: original });
                        goToRecorder();
                      }}
                      onAddAssertion={() => addAssertion(step)}
                      onDelete={() => {
                        const original = originalIndex(step.id);
                        if (original >= 0)
                          window.testron?.command({ type: 'delete-step', index: original });
                        setLog(`Step ${index + 1} deleted`);
                      }}
                    />
                    {branch.map((assertion, position) => {
                      const assertionResult = selectedReplay.steps[originalIndex(assertion.id)];
                      const allowedKinds: AssertionKind[] =
                        assertion.kind === 'urlPath'
                          ? ['urlPath']
                          : [
                              'visible',
                              'hidden',
                              'textEquals',
                              'textContains',
                              'value',
                              'enabled',
                              'disabled',
                              'checked',
                              'unchecked',
                              'countExactly',
                              'countAtLeast',
                            ];
                      return (
                        <Branch key={assertion.id} last={position === branch.length - 1}>
                          <AssertionCard
                            assertion={assertion}
                            kinds={allowedKinds}
                            subjectEditable={false}
                            locatorEditable
                            viewMode={stepViewMode}
                            status={assertionResult?.status}
                            error={assertionResult?.error}
                            canMoveUp={index > 0}
                            canMoveDown={index < steps.length - 1}
                            onAssertion={(next) => updateAssertion(assertion, next)}
                            onMove={(direction) => moveAssertion(assertion, index, direction)}
                            onDelete={() => {
                              const original = originalIndex(assertion.id);
                              if (original >= 0)
                                window.testron?.command({ type: 'delete-step', index: original });
                              setLog('Assertion deleted');
                            }}
                          />
                        </Branch>
                      );
                    })}
                  </div>
                );
              })}
              {steps.length === 0 && (
                <EmptyLane>
                  {t('this_test_has_no_actions_yet_record_it_again_to_add_steps')}
                </EmptyLane>
              )}
              {steps.length > 0 && assertions.length === 0 && (
                <EmptyLane>
                  {t('nothing_is_proved_yet_hover_a_step_and_add_an_assertion')}
                </EmptyLane>
              )}
            </Lane>
            <Flow />

            <Lane icon="history" title={t('runs')} count={runs.length} hint="Recent server runs.">
              {runs.length === 0 && <EmptyLane>{t('this_test_has_no_completed_runs')}</EmptyLane>}
              {runs.map((entry: Run) => (
                <RunCard
                  key={entry.id}
                  run={entry}
                  total={Math.max(fullSteps.length, 1)}
                  selected={entry.id === selectedRun}
                  reportAvailable={false}
                  onClick={() => {
                    setSelectedRun(entry.id);
                    setLog(
                      entry.verdict === 'failed'
                        ? entry.error || 'Failing step highlighted in the steps column'
                        : `Run on ${entry.environment} · ${entry.seconds.toFixed(1)}s`,
                    );
                  }}
                  onLog={setLog}
                />
              ))}
            </Lane>
          </div>
        </div>

        {sourceOpen && (
          <SourceSheet
            lines={lines}
            file={detail.file}
            detached={false}
            source=""
            canDetach={false}
            onDetach={() => undefined}
            onSource={() => undefined}
            onReattach={() => undefined}
            onCopy={() => window.testron?.command({ type: 'copy-source' })}
            onClose={() => setSourceOpen(false)}
            onLog={setLog}
            layout={wideSourceLayout ? 'docked' : 'modal'}
          />
        )}
      </div>

      {moveOpen && (
        <MoveSheet
          projects={movableProjects}
          testSuites={snapshot.library.testSuites}
          currentProjectId={selectedTest?.projectId ?? snapshot.library.selectedProjectId}
          currentTestSuiteId={selectedTest?.testSuiteId}
          onMove={({ projectId, testSuiteId }) => {
            if (!selectedTestId || !selectedTest) return;
            const currentEnvironment = snapshot.library.environments.find(
              (environment) => environment.id === selectedTest.environmentId,
            );
            const destinationEnvironments = snapshot.library.environments.filter(
              (environment) => environment.projectId === projectId,
            );
            const environment =
              destinationEnvironments.find(
                (candidate) => candidate.name === currentEnvironment?.name,
              ) ?? destinationEnvironments[0];
            if (!environment) return;
            window.testron?.command({
              type: 'move-test',
              testId: selectedTestId,
              projectId,
              testSuiteId,
              environmentId: environment.id,
            });
            setMoveOpen(false);
            setLog('Moving test…');
          }}
          onClose={() => setMoveOpen(false)}
        />
      )}

      {prerequisiteEdit && (
        <PrerequisiteSheet
          key={`${prerequisiteEdit.index}-${prerequisiteEdit.value}`}
          prerequisite={prerequisiteEdit.value}
          onSave={(value) => {
            const next = [...prerequisites];
            if (prerequisiteEdit.index === null) next.push(value);
            else next[prerequisiteEdit.index] = value;
            replacePrerequisites(
              next,
              prerequisiteEdit.index === null ? 'Prerequisite added' : 'Prerequisite saved',
            );
            setPrerequisiteEdit(undefined);
          }}
          onClose={() => setPrerequisiteEdit(undefined)}
        />
      )}

      {deleteOpen && selectedTestId && (
        <DeleteSheet
          name={detail.name}
          onClose={() => setDeleteOpen(false)}
          onDelete={() => {
            window.testron?.command({ type: 'delete-test', testId: selectedTestId });
            setDeleteOpen(false);
          }}
        />
      )}

      {browserInstallOpen && desktopRuntime.browserInstallation.status !== 'ready' && (
        <BrowserInstallModal
          installation={desktopRuntime.browserInstallation}
          onInstall={() => {
            runAfterInstall.current = true;
            window.testronDesktop?.installBrowser();
          }}
          onCancel={() => {
            runAfterInstall.current = false;
            window.testronDesktop?.cancelBrowserInstall();
          }}
          onClose={() => {
            runAfterInstall.current = false;
            setBrowserInstallOpen(false);
          }}
        />
      )}

      <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-line px-3 text-ink-3">
        <span className="ui-mono truncate text-ink-2">{detail.file}</span>
        <span className="truncate">{log}</span>
        <span className="ml-auto flex shrink-0 items-center gap-3">
          <span>
            {lines.length} {t('lines')}
          </span>
          <span>
            {t('updated')} {detail.updatedAt}
          </span>
          <a href="#/record" className="text-ink-3 no-underline hover:text-ink">
            {t('edit_in_recorder')}
          </a>
        </span>
      </footer>
    </main>
  );
};
