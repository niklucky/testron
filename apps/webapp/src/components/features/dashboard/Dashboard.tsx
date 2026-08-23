import { useHotkeys } from '@tanstack/react-hotkeys';
import { useTranslation } from '@warpunit/slang-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { AppSnapshot } from '../../../lib/library';
import { goToTest } from '../../../lib/navigation';
import { Button, PulseDot } from '../../ui/design';
import { ProfileModal } from '../account/ProfileModal';
import { Members } from '../members/Members';
import { PendingInvitationModal } from '../members/PendingInvitationModal';
import { ProjectSettings } from '../projects/ProjectSettings';
import { ProjectSwitcher } from '../projects/ProjectSwitcher';
import { ContextRail } from './ContextRail';
import { buildSuites, failures, tally } from './data';
import { createDashboardHotkeyDefinitions, displayShortcut } from './hotkeys';
import { JumpTo, type JumpToItem } from './JumpTo';
import { NewTestForm } from './NewTestForm';
import { initialOverviewState, Overview, type OverviewState } from './Overview';
import { mapProjectOverview } from './overview-data';
import { runs } from './runHistory';
import { initialRunsState, Runs, type RunsState } from './Runs';
import { RunsRail } from './RunsRail';
import { failuresFromLibrary, projectRunsFromLibrary } from './serverRunData';
import { Sidebar } from './Sidebar';
import { loadExpandedSuiteIds, saveExpandedSuiteIds } from './suiteExpansion';
import { TestSuiteForm } from './TestSuiteForm';
import { evidenceTabs, Triage } from './Triage';
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
export const Dashboard = ({
  initialView = 'overview',
  initialSettingsOpen = false,
}: {
  initialView?: View;
  initialSettingsOpen?: boolean;
} = {}) => {
  const { t } = useTranslation();
  const [view, setView] = useState<View>(initialView);
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
  const [log, setLog] = useState('Ready');
  const [library, setLibrary] = useState<AppSnapshot['library']>();
  const [suiteForm, setSuiteForm] = useState<SuiteRecord | null>();
  const [newTestSuite, setNewTestSuite] = useState<SuiteRecord | null>();
  const [settingsOpen, setSettingsOpen] = useState(initialSettingsOpen);
  const [profileOpen, setProfileOpen] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
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

  const suites = useMemo(() => {
    if (!library?.server?.configured) return mockSuites;
    const owner = library.viewer?.name ?? library.viewer?.email ?? 'Workspace owner';
    const toTestRecord = (persisted: (typeof library.tests)[number]): TestRecord => {
      const latestRun = library.latestTestRuns?.[persisted.id];
      return {
        id: persisted.id,
        name: persisted.title,
        status: !latestRun
          ? 'skipped'
          : latestRun.status === 'passed'
            ? 'passed'
            : latestRun.status === 'failed' || latestRun.status === 'timedOut'
              ? 'failed'
              : 'skipped',
        minutesAgo: latestRun
          ? Math.max(0, Math.floor((Date.now() - Date.parse(latestRun.startedAt)) / 60_000))
          : 0,
        seconds: latestRun ? latestRun.durationMs / 1000 : undefined,
      };
    };
    const persistedSuites = library.testSuites
      .filter((testSuite) => testSuite.projectId === library.selectedProjectId)
      .map((testSuite): SuiteRecord => {
        const persistedTests = library.tests.filter((test) => test.testSuiteId === testSuite.id);
        const tests = persistedTests.map(toTestRecord);
        return {
          id: testSuite.id,
          projectId: testSuite.projectId,
          name: testSuite.name,
          owner,
          tests,
          lastRunMinutesAgo: testSuite.lastRunAt
            ? Math.max(0, Math.floor((Date.now() - Date.parse(testSuite.lastRunAt)) / 60_000))
            : null,
          revision: testSuite.revision,
          testCount: persistedTests.length,
          failedCount: testSuite.failedCount,
          totalLatestDurationMs: testSuite.totalLatestDurationMs,
        };
      });

    const ungrouppedTests = library.tests
      .filter((test) => test.projectId === library.selectedProjectId && !test.testSuiteId)
      .map(toTestRecord);
    if (ungrouppedTests.length === 0) return persistedSuites;

    return [
      ...persistedSuites,
      {
        id: `ungroupped:${library.selectedProjectId ?? 'project'}`,
        projectId: library.selectedProjectId,
        name: 'Ungroupped',
        owner,
        tests: ungrouppedTests,
        lastRunMinutesAgo: null,
        synthetic: true,
        testCount: ungrouppedTests.length,
        failedCount: ungrouppedTests.filter((test) => test.status === 'failed').length,
        totalLatestDurationMs: ungrouppedTests.reduce(
          (total, test) => total + (test.seconds ?? 0) * 1000,
          0,
        ),
      },
    ];
  }, [library, mockSuites]);

  const overviewSuites = useMemo(() => {
    if (!library?.server?.configured) return suites;
    const owner = library.viewer?.name ?? library.viewer?.email ?? 'Workspace owner';
    const deletedTestIds = new Set((library.deletedTests ?? []).map((test) => test.id));
    const allTests = [...library.tests, ...(library.deletedTests ?? [])];
    const toTestRecord = (persisted: (typeof allTests)[number]): TestRecord => {
      const latestRun = library.latestTestRuns?.[persisted.id];
      return {
        id: persisted.id,
        name: persisted.title,
        status: !latestRun
          ? 'skipped'
          : latestRun.status === 'passed'
            ? 'passed'
            : latestRun.status === 'failed' || latestRun.status === 'timedOut'
              ? 'failed'
              : 'skipped',
        minutesAgo: latestRun
          ? Math.max(0, Math.floor((Date.now() - Date.parse(latestRun.startedAt)) / 60_000))
          : 0,
        seconds: latestRun ? latestRun.durationMs / 1000 : undefined,
        deleted: deletedTestIds.has(persisted.id),
      };
    };

    const deletedBySuite = new Map<string | null, TestRecord[]>();
    for (const persisted of library.deletedTests ?? []) {
      if (persisted.projectId !== library.selectedProjectId) continue;
      const suiteId = persisted.testSuiteId ?? null;
      deletedBySuite.set(suiteId, [
        ...(deletedBySuite.get(suiteId) ?? []),
        toTestRecord(persisted),
      ]);
    }

    const combined = suites.map((suite) => {
      const deleted = deletedBySuite.get(suite.synthetic ? null : suite.id) ?? [];
      return deleted.length === 0 ? suite : { ...suite, tests: [...suite.tests, ...deleted] };
    });
    if (!combined.some((suite) => suite.synthetic) && (deletedBySuite.get(null)?.length ?? 0) > 0)
      combined.push({
        id: `ungroupped:${library.selectedProjectId ?? 'project'}`,
        projectId: library.selectedProjectId,
        name: 'Ungroupped',
        owner,
        tests: deletedBySuite.get(null) ?? [],
        lastRunMinutesAgo: null,
        synthetic: true,
      });

    const deletedSuites = (library.deletedTestSuites ?? [])
      .filter((suite) => suite.projectId === library.selectedProjectId)
      .map((suite): SuiteRecord => ({
        id: suite.id,
        projectId: suite.projectId,
        name: suite.name,
        owner,
        tests: allTests.filter((test) => test.testSuiteId === suite.id).map(toTestRecord),
        lastRunMinutesAgo: suite.lastRunAt
          ? Math.max(0, Math.floor((Date.now() - Date.parse(suite.lastRunAt)) / 60_000))
          : null,
        revision: suite.revision,
        deleted: true,
      }));
    return [...combined, ...deletedSuites];
  }, [library, suites]);

  const projectRuns = useMemo(
    () => (library?.server?.configured ? projectRunsFromLibrary(library) : runs),
    [library],
  );
  const openFailures = useMemo(
    () => (library?.server?.configured ? failuresFromLibrary(library) : failures),
    [library],
  );

  const expansionProjectId = library?.selectedProjectId ?? 'local-workspace';
  const suiteIds = useMemo(() => suites.map((suite) => suite.id), [suites]);
  const overviewSuiteIds = useMemo(() => overviewSuites.map((suite) => suite.id), [overviewSuites]);
  const defaultExpandedSuiteIds = useMemo(
    () => suites.filter((suite) => suite.name === 'Checkout').map((suite) => suite.id),
    [suites],
  );
  const [expandedSuiteIds, setExpandedSuiteIds] = useState<string[]>([]);
  const [overviewExpandedSuiteIds, setOverviewExpandedSuiteIds] = useState<string[]>([]);

  useEffect(() => {
    setExpandedSuiteIds(
      loadExpandedSuiteIds(
        window.localStorage,
        expansionProjectId,
        new Set(suiteIds),
        defaultExpandedSuiteIds,
      ),
    );
  }, [defaultExpandedSuiteIds, expansionProjectId, suiteIds]);

  useEffect(() => {
    setOverviewExpandedSuiteIds(
      loadExpandedSuiteIds(
        window.localStorage,
        expansionProjectId,
        new Set(overviewSuiteIds),
        [],
        'overview',
      ),
    );
  }, [expansionProjectId, overviewSuiteIds]);

  const toggleSuite = (suiteId: string) => {
    setExpandedSuiteIds((current) => {
      const next = current.includes(suiteId)
        ? current.filter((id) => id !== suiteId)
        : [...current, suiteId];
      saveExpandedSuiteIds(window.localStorage, expansionProjectId, next);
      return next;
    });
  };

  const toggleOverviewSuite = (suiteId: string) => {
    setOverviewExpandedSuiteIds((current) => {
      const next = current.includes(suiteId)
        ? current.filter((id) => id !== suiteId)
        : [...current, suiteId];
      saveExpandedSuiteIds(window.localStorage, expansionProjectId, next, 'overview');
      return next;
    });
  };

  const queue = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const viewer = library?.server?.configured
      ? (library.viewer?.name ?? library.viewer?.email)
      : 'Nikita S.';
    return openFailures.filter((failure) => {
      if (scope === 'new' && failure.kind !== 'new') return false;
      if (scope === 'flaky' && failure.kind !== 'flaky') return false;
      if (scope === 'mine' && failure.owner !== viewer) return false;
      if (!needle) return true;
      return `${failure.signature} ${failure.test} ${failure.suite} ${failure.file}`
        .toLowerCase()
        .includes(needle);
    });
  }, [library?.viewer, openFailures, scope, query]);

  const selected: Failure | undefined = queue[Math.min(cursor, queue.length - 1)];

  useEffect(() => {
    setManualCursor(0);
    if (selected && selected.steps.length === 0) setTab('error');
  }, [selected?.id]);

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
    if (!selected) return;
    if (key === 'r') setLog(`Re-run queued · ${selected.file} on ${selected.env}`);
    if (key === 'q') hold(selected);
    if (key === 'b') setLog(`Bug drafted · ${selected.signature} → tracker`);
  };

  const openTest = (test: TestRecord) => {
    setLog(`Opening test · ${test.name}`);
    window.testron?.command({ type: 'select-test', testId: test.id });
    goToTest(test.id);
  };

  const recordManualVerdict = (verdict: ManualVerdict) => {
    if (!selected) return;
    const step = selected.steps[manualCursor];
    if (!step) return;
    setManualResults((current) => ({ ...current, [step.id]: verdict }));
    setManualCursor((current) => Math.min(current + 1, selected.steps.length - 1));
    setLog(`Manual step ${manualCursor + 1} marked ${verdict}`);
  };

  const blockingModalOpen =
    suiteForm !== undefined ||
    newTestSuite !== undefined ||
    settingsOpen ||
    profileOpen ||
    Boolean(library?.pendingInvitations?.[0]);

  useHotkeys(
    createDashboardHotkeyDefinitions(
      {
        toggleJump: () => setJumpOpen((open) => !open),
        moveFailure: (direction) => {
          setView('triage');
          setCursor((current) =>
            direction === 1 ? Math.min(current + 1, queue.length - 1) : Math.max(current - 1, 0),
          );
        },
        moveEvidence: (direction) => {
          const tabs = selected?.steps.length
            ? evidenceTabs
            : evidenceTabs.filter((entry) => entry.id === 'error' || entry.id === 'history');
          const index = tabs.findIndex((entry) => entry.id === tab);
          const next = (Math.max(0, index) + direction + tabs.length) % tabs.length;
          setTab(tabs[next].id);
        },
        openFilter: () => {
          setFilterOpen(true);
          window.setTimeout(() => filterRef.current?.focus(), 0);
        },
        closeFilter: () => {
          setQuery('');
          setFilterOpen(false);
          filterRef.current?.blur();
        },
        openView: setView,
        runAction,
        manualVerdict: recordManualVerdict,
      },
      {
        navigationEnabled: !blockingModalOpen && !jumpOpen,
        jumpEnabled: !blockingModalOpen,
        filterOpen: !blockingModalOpen && !jumpOpen && filterOpen,
        manualEnabled: !blockingModalOpen && !jumpOpen && view === 'triage' && tab === 'manual',
      },
    ),
  );

  const jumpItems: JumpToItem[] = [
    ...(
      [
        ['overview', 'Overview'],
        ['triage', 'Triage'],
        ['runs', 'Run history'],
        ['members', 'Members'],
      ] as const
    ).map(([destination, label]) => ({
      id: `view-${destination}`,
      label,
      detail: 'View',
      onSelect: () => setView(destination),
    })),
    ...suites.map((suite) => ({
      id: `suite-${suite.id}`,
      label: suite.name,
      detail: 'Test suite',
      keywords: suite.owner,
      onSelect: () => {
        setView('overview');
        if (!expandedSuiteIds.includes(suite.id)) toggleSuite(suite.id);
        setLog(`Jumped to test suite · ${suite.name}`);
      },
    })),
    ...suites.flatMap((suite) =>
      suite.tests.map((test) => ({
        id: `test-${test.id}`,
        label: test.name,
        detail: suite.name,
        keywords: `test ${suite.name}`,
        onSelect: () => openTest(test),
      })),
    ),
  ];

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
  const projectOverview = library?.projectOverviews?.find(
    (summary) => summary.projectId === library.selectedProjectId,
  );
  const liveOverview = projectOverview ? mapProjectOverview(projectOverview) : undefined;
  const overviewDataStatus = !library?.server?.configured
    ? ('local' as const)
    : library.server.workspace === 'loading'
      ? ('loading' as const)
      : library.server.status === 'error'
        ? ('error' as const)
        : liveOverview
          ? ('live' as const)
          : ('error' as const);

  return (
    <main className="ui-root flex h-screen w-screen flex-col overflow-hidden bg-plane font-sans text-ink antialiased">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-3 [-webkit-app-region:drag]">
        {/* Room for the macOS traffic lights. */}
        <div className="w-[74px] shrink-0" />

        <div className="flex items-center gap-2 [-webkit-app-region:no-drag]">
          {library && <ProjectSwitcher library={library} />}
        </div>

        <div className="flex items-center gap-2 rounded-md border border-line bg-surface px-2 py-1 [-webkit-app-region:no-drag] text-sm">
          <PulseDot label={t('runs_in_flight')} />
          <span className="text-ink-2">
            {t('now_running')}: {liveOverview?.runsInFlight ?? library?.runsInFlight ?? 0}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1.5 [-webkit-app-region:no-drag]">
          <Button icon="search" kbd={displayShortcut('jump')} onClick={() => setJumpOpen(true)}>
            {t('jump_to')}
          </Button>
        </div>
      </header>

      <div
        className={`grid min-h-0 flex-1 ${
          view !== 'overview' && view !== 'members' && !focusMode
            ? 'grid-cols-[336px_minmax(0,1fr)_330px]'
            : 'grid-cols-[336px_minmax(0,1fr)]'
        }`}
      >
        <Sidebar
          view={view}
          onView={setView}
          suites={suites}
          expandedSuiteIds={expandedSuiteIds}
          onToggleSuite={toggleSuite}
          openFailures={openFailures.length}
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
          onEditSuite={(suite) => {
            if (!suite.synthetic && !suite.deleted) setSuiteForm(suite);
          }}
          onDeleteSuite={(suite) => {
            if (suite.synthetic || suite.revision === undefined) return;
            window.testron?.command({
              type: 'delete-test-suite',
              testSuiteId: suite.id,
              baseRevision: suite.revision,
            });
            setLog(`Deleting test suite · ${suite.name}`);
          }}
          onSettings={() => setSettingsOpen(true)}
          onProfile={() => setProfileOpen(true)}
          onLog={setLog}
          viewer={library?.viewer}
          canSignOut={library?.server?.authentication === 'signedIn'}
        />

        {view === 'overview' ? (
          <Overview
            suites={overviewSuites}
            totals={totals}
            live={liveOverview}
            dataStatus={overviewDataStatus}
            errorMessage={library?.server?.message}
            recentActivity={library?.recentActivity?.filter(
              (item) => item.projectId === library.selectedProjectId,
            )}
            expandedSuiteIds={overviewExpandedSuiteIds}
            state={overview}
            onState={setOverview}
            onToggleSuite={toggleOverviewSuite}
            onEditSuite={(suite) => {
              if (!suite.synthetic && !suite.deleted) setSuiteForm(suite);
            }}
            onOpenTest={openTest}
            onLog={setLog}
          />
        ) : view === 'members' ? (
          library ? (
            <Members library={library} />
          ) : null
        ) : view === 'runs' ? (
          <>
            <Runs runs={projectRuns} state={runsState} onState={setRunsState} onLog={setLog} />
            {!focusMode && (
              <RunsRail
                period={projectRuns.filter((run) => run.minutesAgo / 1_440 < runsState.range)}
                onFilter={(query) => setRunsState({ ...runsState, query })}
              />
            )}
          </>
        ) : (
          <>
            <Triage
              failure={selected}
              failures={queue}
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
              quarantined={selected ? quarantined.includes(selected.id) : false}
              onAction={runAction}
              onSelectFailure={(id) => {
                const index = queue.findIndex((entry) => entry.id === id);
                if (index >= 0) setCursor(index);
              }}
            />
            {!focusMode && (
              <ContextRail failures={openFailures} runs={projectRuns} suites={suites} />
            )}
          </>
        )}
      </div>

      <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-line px-3 text-ink-3">
        <span className="ui-mono truncate text-ink-2">
          {view === 'overview'
            ? t('commerce_app_overview')
            : view === 'members'
              ? t('project_access_members')
              : (selected?.file ?? t('triage'))}
        </span>
        <span className="truncate">{log}</span>
        <span className="ml-auto flex shrink-0 items-center gap-3">
          <span>
            {quarantined.length} {t('quarantined')}
          </span>
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
            setNewTestSuite(undefined);
            setLog(`Creating test on server · ${title}`);
          }}
        />
      )}
      {settingsOpen && library && (
        <ProjectSettings library={library} onClose={() => setSettingsOpen(false)} />
      )}
      {profileOpen && library && (
        <ProfileModal library={library} onClose={() => setProfileOpen(false)} />
      )}
      {library?.pendingInvitations?.[0] && (
        <PendingInvitationModal
          invitation={library.pendingInvitations[0]}
          pending={library.server?.status === 'syncing'}
          error={library.server?.status === 'error' ? library.server.message : undefined}
        />
      )}
      <JumpTo
        open={jumpOpen}
        items={jumpItems}
        shortcut={displayShortcut('jump')}
        onClose={() => setJumpOpen(false)}
      />
    </main>
  );
};
