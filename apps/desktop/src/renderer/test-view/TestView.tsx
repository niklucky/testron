import { useEffect, useMemo, useState } from 'react';

import type { Step } from '@testron/domain/steps/schema';
import type { AppSnapshot } from '../../preload/api';
import { Badge, Button, Icon, IconButton, PulseDot, StatusDot, useTheme } from '../design';
import { presentSource } from '../record/live';
import { replacePrimaryLocator } from '../record/locator-edit';
import type { RecordedStep } from '../record/types';
import { Branch, EmptyLane, Flow, Lane } from './Board';
import { AssertionCard, DetailCard, RunCard, StepArrow, StepCard } from './columns';
import { liveTestBoard } from './live';
import { SourceSheet } from './sheets';
import { assertionsFor } from './spec';
import type { Assertion, AssertionKind, Run, TestDetail } from './types';

const EMPTY_SNAPSHOT: AppSnapshot = {
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
  library: { projects: [], environments: [], profiles: [], profileVariables: [], tests: [] },
  replay: { status: 'idle', steps: [] },
  replayHistory: [],
  verifyAssertion: 'visible',
};

const isAssertion = (step: Step): boolean => step.kind.startsWith('assert');

/** The persisted test, read left to right from the same snapshot used by the recorder. */
export const TestView = () => {
  const { theme, toggle } = useTheme();
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [loaded, setLoaded] = useState(false);
  const [selectedRun, setSelectedRun] = useState<string>();
  const [sourceOpen, setSourceOpen] = useState(false);
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
  const running = snapshot.replay.status === 'running';
  const selectedReplay = useMemo(() => {
    if (!selectedRun) return snapshot.replay;
    if (selectedRun === 'current-run') return snapshot.replay;
    const startedAt = selectedRun.slice('run-'.length);
    return (
      snapshot.replayHistory.find((replay) => replay.startedAt === startedAt) ?? snapshot.replay
    );
  }, [selectedRun, snapshot.replay, snapshot.replayHistory]);

  useEffect(() => {
    if (runs[0]) setSelectedRun(runs[0].id);
  }, [runs[0]?.id]);

  useEffect(() => {
    if (!loaded) return;
    if (!selectedTestId) setLog('No test selected · record a test first');
    else if (snapshot.replay.status === 'running') setLog(`Running on ${detail.environments[0]}…`);
    else if (snapshot.replay.status !== 'idle')
      setLog(
        `Run ${snapshot.replay.status} · ${snapshot.replay.steps.filter((one) => one.status === 'passed').length}/${snapshot.replay.steps.length} steps passed`,
      );
    else setLog(`${detail.name} · ${snapshot.steps.length} persisted steps`);
  }, [loaded, selectedTestId, snapshot.replay, snapshot.steps.length, detail]);

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

  const run = () => {
    if (running) {
      window.testron?.command({ type: 'cancel-run' });
      setLog('Cancelling run…');
      return;
    }
    window.testron?.command({
      type: 'run-test',
      environmentVariables: {},
      timeoutMs: 30_000,
      reuseAuthState: false,
    });
    setLog(`Starting run on ${detail.environments[0] ?? 'Local'}…`);
  };

  const lastVerdict = runs[0]?.verdict;

  if (loaded && !selectedTestId) {
    return (
      <main className="ui-root grid h-screen w-screen place-items-center bg-plane font-sans text-ink antialiased">
        <section className="w-[420px] rounded-xl border border-line bg-surface p-6 text-center shadow-xl">
          <Icon name="test" size={28} className="mx-auto text-ink-3" />
          <h1 className="mt-3 text-lg font-semibold">No test selected</h1>
          <p className="mt-1 text-base text-ink-3">
            Record and save a test before opening its board.
          </p>
          <Button
            variant="primary"
            icon="record"
            className="mt-5"
            onClick={() => {
              window.testron?.command({ type: 'prepare-new-test' });
              window.location.hash = '#/record';
            }}
          >
            Record a test
          </Button>
        </section>
      </main>
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
            label="Back to the dashboard"
            onClick={() => (window.location.hash = '#/')}
          />
          <Button variant="ghost" size="sm" iconEnd="caret">
            {detail.project}
          </Button>
          <Icon name="chevron" size={12} className="shrink-0 text-ink-3" />
          <Button variant="ghost" size="sm" iconEnd="caret">
            {detail.suite}
          </Button>
          <Icon name="chevron" size={12} className="shrink-0 text-ink-3" />
          <span className="flex min-w-0 items-center gap-1.5 px-1.5 text-md">
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
              label={lastVerdict ? `Last run ${lastVerdict}` : 'Never run'}
            />
            <span className="truncate">{detail.name}</span>
          </span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 [-webkit-app-region:no-drag]">
          <Badge tone="good" icon="check">
            Persisted
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
                  ? 'Sync conflict'
                  : snapshot.library.server.status}
              </Badge>
              {snapshot.library.server.authentication === 'signedIn' && (
                <>
                  <Button
                    size="sm"
                    icon="rerun"
                    onClick={() => window.testron?.command({ type: 'sync-now' })}
                  >
                    Sync
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      window.testron?.command({ type: 'logout-server' });
                      window.location.hash = '#/';
                    }}
                  >
                    Sign out
                  </Button>
                </>
              )}
              {snapshot.library.server.authentication === 'signedOut' && (
                <Button size="sm" onClick={() => (window.location.hash = '#/')}>
                  Sign in
                </Button>
              )}
            </>
          )}
          <IconButton
            icon={theme === 'dark' ? 'sun' : 'moon'}
            size="sm"
            label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
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
        >
          {running ? 'Cancel run' : `Run on ${detail.environments[0] ?? 'Local'}`}
        </Button>
        <Button icon="code" pressed={sourceOpen} onClick={() => setSourceOpen((open) => !open)}>
          {sourceOpen && wideSourceLayout ? 'Hide source' : 'View source'}
        </Button>
        <Button icon="pencil" onClick={() => (window.location.hash = '#/record')}>
          Edit in recorder
        </Button>
        <span className="mx-1 h-5 w-px bg-line" />
        <Button icon="suite" disabled>
          Move
        </Button>
        <Button icon="trash" disabled>
          Delete
        </Button>
        <span className="ml-auto flex items-center gap-3 text-sm text-ink-3">
          {running && <PulseDot tone="accent" label="Running" />}
          <span>
            {steps.length} actions · {assertions.length} assertions
          </span>
          <span className="ui-mono">{detail.file}</span>
        </span>
      </div>

      <div
        className={`relative min-h-0 flex-1 ${sourceOpen && wideSourceLayout ? 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : ''}`}
      >
        <div data-testid="test-board" className="ui-scroll h-full min-h-0 min-w-0 overflow-x-auto">
          <div className="flex h-full min-w-max items-stretch px-4 py-3">
            <Lane icon="test" title="Test" width={320}>
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
              title="Prerequisites"
              count={prerequisites.length}
              hint="Not configured for this test."
            >
              <EmptyLane>Prerequisites are not persisted for this test yet.</EmptyLane>
            </Lane>
            <Flow />

            <Lane
              icon="steps"
              title="Steps"
              count={steps.length}
              hint={`${assertions.length} assertions hang off them.`}
              width={360}
              contentTestId="steps-lane-scroll"
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
                      failed={result?.status === 'failed'}
                      running={result?.status === 'running'}
                      passed={result?.status === 'passed'}
                      error={result?.error}
                      onStep={(next) => updateAction(step, next)}
                      onRepick={() => {
                        const original = originalIndex(step.id);
                        if (original < 0) return;
                        window.testron?.command({ type: 'set-repick-step', index: original });
                        window.location.hash = '#/record';
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
                <EmptyLane>This test has no actions yet. Record it again to add steps.</EmptyLane>
              )}
              {steps.length > 0 && assertions.length === 0 && (
                <EmptyLane>Nothing is proved yet. Hover a step and add an assertion.</EmptyLane>
              )}
            </Lane>
            <Flow />

            <Lane icon="history" title="Runs" count={runs.length} hint="Current app session.">
              {runs.length === 0 && <EmptyLane>Never run in this session.</EmptyLane>}
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

      <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-line px-3 text-sm text-ink-3">
        <span className="ui-mono truncate text-ink-2">{detail.file}</span>
        <span className="truncate">{log}</span>
        <span className="ml-auto flex shrink-0 items-center gap-3">
          <span>{lines.length} lines</span>
          <span>updated {detail.updatedAt}</span>
          <a href="#/record" className="text-ink-3 no-underline hover:text-ink">
            Edit in recorder
          </a>
        </span>
      </footer>
    </main>
  );
};
