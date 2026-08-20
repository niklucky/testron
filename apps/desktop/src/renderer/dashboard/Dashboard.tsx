import { useEffect, useMemo, useRef, useState } from 'react';

import type { AppSnapshot } from '../../preload/api';
import { Button, PulseDot } from '../design';
import { ContextRail } from './ContextRail';
import { buildSuites, failures, tally } from './data';
import { initialOverviewState, Overview, type OverviewState } from './Overview';
import { runs } from './runHistory';
import { initialRunsState, Runs, type RunsState } from './Runs';
import { RunsRail } from './RunsRail';
import { Sidebar } from './Sidebar';
import { NewTestForm } from './NewTestForm';
import { TestSuiteForm } from './TestSuiteForm';
import { evidenceTabs, Triage } from './Triage';
import { ProjectSwitcher } from '../projects/ProjectSwitcher';
import { ProjectSettings } from '../projects/ProjectSettings';
import type {
  EvidenceTab,
  Failure,
  ManualVerdict,
  Scope,
  SuiteRecord,
  TestRecord,
  View,
} from './types';

/**
 * Testron's main window.
 *
 * Two halves of the same job: the left rail carries the project's structure
 * above the day's work, and the canvas is either the project dashboard or the
 * evidence for one failure. Everything reachable by mouse is also reachable by
 * key — the shortcuts are documented in the context rail rather than hidden in
 * a settings screen.
 *
 * This component owns the session state and the keyboard map; every pixel it
 * draws comes from ../design.
 */
export const Dashboard = () => {
  const [view, setView] = useState<View>('overview');
  const [mockSuites, setMockSuites] = useState<SuiteRecord[]>(buildSuites);
  const [scope, setScope] = useState<Scope>('all');
  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [tab, setTab] = useState<EvidenceTab>('steps');
  const compact = false;
  const focusMode = false;
  const [quarantined, setQuarantined] = useState<string[]>([]);
  const [manualResults, setManualResults] = useState<Record<string, ManualVerdict>>({});
  const [manualCursor, setManualCursor] = useState(0);
  const [shotView, setShotView] = useState<'actual' | 'expected'>('actual');
  const [overview, setOverview] = useState<OverviewState>(initialOverviewState);
  const [runsState, setRunsState] = useState<RunsState>(initialRunsState);
  const [log, setLog] = useState('Ready · 9 open failures across 6 suites');
  const [library, setLibrary] = useState<AppSnapshot['library']>();
  const [suiteForm, setSuiteForm] = useState<SuiteRecord | null>();
  const [newTestSuite, setNewTestSuite] = useState<SuiteRecord | null>();
  const [creatingTest, setCreatingTest] = useState(false);
  const creatingFromTestId = useRef<string | undefined>(undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const filterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.testron?.command({ type: 'set-shell-route', route: 'dashboard' });
    const unsubscribe = window.testron?.onSnapshot((snapshot) => setLibrary(snapshot.library));
    window.testron?.command({ type: 'request-snapshot' });
    const refresh = window.setInterval(
      () => window.testron?.command({ type: 'refresh-workspace' }),
      5_000,
    );
    return () => {
      window.clearInterval(refresh);
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!creatingTest || !library?.selectedTestId) return;
    if (library.selectedTestId === creatingFromTestId.current) return;
    setCreatingTest(false);
    window.location.hash = '#/record';
  }, [creatingTest, library?.selectedTestId]);

  useEffect(() => {
    if (!creatingTest || library?.server?.status !== 'error') return;
    setCreatingTest(false);
    setLog(library.server.message ?? 'The test could not be created.');
  }, [creatingTest, library?.server?.message, library?.server?.status]);

  const suites = useMemo(() => {
    if (!library?.server?.configured) return mockSuites;
    const owner = library.viewer?.name ?? library.viewer?.email ?? 'Workspace owner';
    const templates = buildSuites();
    return library.testSuites
      .filter((testSuite) => testSuite.projectId === library.selectedProjectId)
      .map((testSuite, suiteIndex): SuiteRecord => {
        const template =
          templates.find((candidate) => candidate.name === testSuite.name) ??
          templates[suiteIndex % templates.length]!;
        const persistedTests = library.tests.filter((test) => test.testSuiteId === testSuite.id);
        const tests = persistedTests.map((persisted) => {
          const latestRun = library.latestTestRuns?.[persisted.id];
          return {
            id: persisted.id,
            name: persisted.title,
            status: !latestRun
              ? ('skipped' as const)
              : latestRun.status === 'passed'
                ? ('passed' as const)
                : latestRun.status === 'failed' || latestRun.status === 'timedOut'
                  ? ('failed' as const)
                  : ('skipped' as const),
            minutesAgo: 0,
            seconds: latestRun ? latestRun.durationMs / 1000 : undefined,
          };
        });
        return {
          id: testSuite.id,
          projectId: testSuite.projectId,
          name: testSuite.name,
          owner,
          tests,
          lastRunMinutesAgo: template.lastRunMinutesAgo,
          revision: testSuite.revision,
          testCount: persistedTests.length,
          failedCount: testSuite.failedCount,
          totalLatestDurationMs: testSuite.totalLatestDurationMs,
        };
      });
  }, [library, mockSuites]);

  const queue = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return failures.filter((failure) => {
      if (scope === 'new' && failure.kind !== 'new') return false;
      if (scope === 'flaky' && failure.kind !== 'flaky') return false;
      if (scope === 'mine' && failure.owner !== 'Nikita S.') return false;
      if (!needle) return true;
      return `${failure.signature} ${failure.test} ${failure.suite} ${failure.file}`
        .toLowerCase()
        .includes(needle);
    });
  }, [scope, query]);

  const selected: Failure = queue[Math.min(cursor, queue.length - 1)] ?? failures[0];

  useEffect(() => {
    setManualCursor(0);
  }, [selected.id]);

  const hold = (failure: Failure) => {
    setQuarantined((current) =>
      current.includes(failure.id)
        ? current.filter((id) => id !== failure.id)
        : [...current, failure.id],
    );
    setLog(
      quarantined.includes(failure.id)
        ? `Released from quarantine · ${failure.test}`
        : `Quarantined · ${failure.test} will not block the pipeline`,
    );
  };

  const runAction = (key: 'r' | 'q' | 'b') => {
    if (key === 'r') setLog(`Re-run queued · ${selected.file} on ${selected.env}`);
    if (key === 'q') hold(selected);
    if (key === 'b') setLog(`Bug drafted · ${selected.signature} → tracker`);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      // While typing, the only shortcut is the one that gets you out.
      if (typing) {
        if (event.key === 'Escape') {
          setQuery('');
          setFilterOpen(false);
          target.blur();
        }
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault();
        setView('triage');
        setCursor((current) => Math.min(current + 1, queue.length - 1));
      } else if (key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault();
        setView('triage');
        setCursor((current) => Math.max(current - 1, 0));
      } else if (event.key === '[' || event.key === ']') {
        event.preventDefault();
        const index = evidenceTabs.findIndex((entry) => entry.id === tab);
        const next =
          (index + (event.key === ']' ? 1 : evidenceTabs.length - 1)) % evidenceTabs.length;
        setTab(evidenceTabs[next].id);
      } else if (event.key === '/') {
        event.preventDefault();
        setFilterOpen(true);
        window.setTimeout(() => filterRef.current?.focus(), 0);
      } else if (key === 'o') {
        setView('overview');
      } else if (key === 't') {
        setView('triage');
      } else if (key === 'h') {
        setView('runs');
      } else if (key === 'r' || key === 'q' || key === 'b') {
        runAction(key);
      } else if (view === 'triage' && tab === 'manual' && ['p', 'f', 'x'].includes(key)) {
        const step = selected.steps[manualCursor];
        if (!step) return;
        const verdict: ManualVerdict = key === 'p' ? 'pass' : key === 'f' ? 'fail' : 'block';
        setManualResults((current) => ({ ...current, [step.id]: verdict }));
        setManualCursor((current) => Math.min(current + 1, selected.steps.length - 1));
        setLog(`Manual step ${manualCursor + 1} marked ${verdict}`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [queue.length, selected, tab, manualCursor, quarantined, view]);

  const openTest = (test: TestRecord) => {
    setLog(`Opening test · ${test.name}`);
    window.testron?.command({ type: 'select-test', testId: test.id });
    window.location.hash = '#/test';
  };

  const reorder = (suiteId: string, from: number, to: number) =>
    setMockSuites((current) =>
      current.map((suite) => {
        if (suite.id !== suiteId) return suite;
        const tests = [...suite.tests];
        const [moved] = tests.splice(from, 1);
        tests.splice(to, 0, moved);
        return { ...suite, tests };
      }),
    );

  const totals = suites.reduce(
    (sum, suite) => {
      const counts = tally(suite);
      return {
        tests: sum.tests + suite.tests.length,
        passed: sum.passed + counts.passed,
        skipped: sum.skipped + counts.skipped,
        failed: sum.failed + counts.failed,
      };
    },
    { tests: 0, passed: 0, skipped: 0, failed: 0 },
  );

  return (
    <main className="ui-root flex h-screen w-screen flex-col overflow-hidden bg-plane font-sans text-ink antialiased">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-3 [-webkit-app-region:drag]">
        {/* Room for the macOS traffic lights. */}
        <div className="w-[74px] shrink-0" />

        <div className="flex items-center gap-2 [-webkit-app-region:no-drag]">
          {library && <ProjectSwitcher library={library} />}
        </div>

        <div className="flex items-center gap-2 rounded-md border border-line bg-surface px-2 py-1 [-webkit-app-region:no-drag]">
          <PulseDot label="Runs in flight" />
          <span className="text-base text-ink-2">
            {library?.runsInFlight ?? 0} {(library?.runsInFlight ?? 0) === 1 ? 'run' : 'runs'} in
            flight
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1.5 [-webkit-app-region:no-drag]">
          <Button icon="search" kbd="⌘K" onClick={() => setLog('Jump to… · not wired up yet')}>
            Jump to…
          </Button>
        </div>
      </header>

      <div
        className={`grid min-h-0 flex-1 ${
          view !== 'overview' && !focusMode
            ? 'grid-cols-[336px_minmax(0,1fr)_330px]'
            : 'grid-cols-[336px_minmax(0,1fr)]'
        }`}
      >
        <Sidebar
          view={view}
          onView={setView}
          suites={suites}
          openFailures={failures.length}
          queue={queue}
          scope={scope}
          onScope={(next) => {
            setScope(next);
            setCursor(0);
          }}
          query={query}
          onQuery={(next) => {
            setQuery(next);
            setCursor(0);
          }}
          filterOpen={filterOpen}
          onFilterOpen={setFilterOpen}
          filterRef={filterRef}
          selectedFailure={selected}
          compact={compact}
          quarantined={quarantined}
          onSelectFailure={(index) => {
            setCursor(index);
            setView('triage');
          }}
          onOpenTest={openTest}
          onNewTest={(suite) => setNewTestSuite(suite ?? null)}
          onReorder={reorder}
          onNewSuite={() => setSuiteForm(null)}
          onEditSuite={(suite) => setSuiteForm(suite)}
          onDeleteSuite={(suite) => {
            if (suite.revision === undefined) return;
            window.testron?.command({
              type: 'delete-test-suite',
              testSuiteId: suite.id,
              baseRevision: suite.revision,
            });
            setLog(`Deleting test suite · ${suite.name}`);
          }}
          onSettings={() => setSettingsOpen(true)}
          onLog={setLog}
          viewer={library?.viewer}
          canSignOut={library?.server?.authentication === 'signedIn'}
        />

        {view === 'overview' ? (
          <Overview
            suites={suites}
            totals={totals}
            state={overview}
            onState={setOverview}
            onLog={setLog}
          />
        ) : view === 'runs' ? (
          <>
            <Runs state={runsState} onState={setRunsState} onLog={setLog} />
            {!focusMode && (
              <RunsRail
                period={runs.filter((run) => run.minutesAgo / 1_440 < runsState.range)}
                onFilter={(query) => setRunsState({ ...runsState, query })}
              />
            )}
          </>
        ) : (
          <>
            <Triage
              failure={selected}
              tab={tab}
              onTab={setTab}
              shotView={shotView}
              onShotView={setShotView}
              manualResults={manualResults}
              manualCursor={manualCursor}
              onManualCursor={setManualCursor}
              onManualVerdict={(stepId, verdict) => {
                setManualResults((current) => ({ ...current, [stepId]: verdict }));
                setLog(`Manual verdict recorded · ${verdict}`);
              }}
              quarantined={quarantined.includes(selected.id)}
              onAction={runAction}
              onSelectFailure={(id) => setCursor(queue.findIndex((entry) => entry.id === id))}
            />
            {!focusMode && <ContextRail failing={totals.failed} />}
          </>
        )}
      </div>

      <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-line px-3 text-sm text-ink-3">
        <span className="ui-mono truncate text-ink-2">
          {view === 'overview' ? 'Commerce app · overview' : selected.file}
        </span>
        <span className="truncate">{log}</span>
        <span className="ml-auto flex shrink-0 items-center gap-3">
          <span>{quarantined.length} quarantined</span>
          <span className="flex items-center gap-1.5">
            <span className="h-[6px] w-[6px] rounded-full bg-good" />4 workers online
          </span>
          <a href="#/experiments" className="text-ink-3 no-underline hover:text-ink">
            UI studies
          </a>
        </span>
      </footer>

      {suiteForm !== undefined && (
        <TestSuiteForm
          suite={suiteForm ?? undefined}
          onClose={() => setSuiteForm(undefined)}
          onSave={(name) => {
            if (suiteForm) {
              if (suiteForm.revision === undefined) return;
              window.testron?.command({
                type: 'update-test-suite',
                testSuiteId: suiteForm.id,
                baseRevision: suiteForm.revision,
                name,
              });
              setLog(`Updating test suite · ${name}`);
            } else if (library?.selectedProjectId) {
              window.testron?.command({
                type: 'create-test-suite',
                projectId: library.selectedProjectId,
                name,
              });
              setLog(`Creating test suite · ${name}`);
            } else {
              setLog('Select a project before creating a test suite.');
              return;
            }
            setSuiteForm(undefined);
          }}
        />
      )}
      {newTestSuite !== undefined && (
        <NewTestForm
          suiteName={newTestSuite?.name}
          onClose={() => setNewTestSuite(undefined)}
          onStart={(title) => {
            setLog(
              newTestSuite ? `New test · ${title} in ${newTestSuite.name}` : `New test · ${title}`,
            );
            if (newTestSuite)
              window.testron?.command({
                type: 'select-test-suite',
                testSuiteId: newTestSuite.id,
              });
            const projectId = library?.selectedProjectId;
            const environmentId = library?.selectedEnvironmentId;
            if (!projectId || !environmentId) {
              setLog('Select a project environment before recording a test.');
              return;
            }
            window.testron?.command({
              type: 'create-test',
              projectId,
              environmentId,
              title,
            });
            creatingFromTestId.current = library?.selectedTestId;
            setCreatingTest(true);
            setNewTestSuite(undefined);
            setLog(`Creating test on server · ${title}`);
          }}
        />
      )}
      {settingsOpen && library && (
        <ProjectSettings library={library} onClose={() => setSettingsOpen(false)} />
      )}
    </main>
  );
};
