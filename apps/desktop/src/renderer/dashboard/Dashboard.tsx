import { useEffect, useMemo, useRef, useState } from 'react';

import type { AppSnapshot } from '../../preload/api';
import { Avatar, Badge, Button, IconButton, PulseDot, useTheme } from '../design';
import { ContextRail } from './ContextRail';
import { buildSuites, failures, tally } from './data';
import { age } from './format';
import { initialOverviewState, Overview, type OverviewState } from './Overview';
import { runs } from './runHistory';
import { initialRunsState, Runs, type RunsState } from './Runs';
import { RunsRail } from './RunsRail';
import { Sidebar } from './Sidebar';
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
export const Dashboard = () => {
  const { theme, toggle } = useTheme();
  const [view, setView] = useState<View>('overview');
  const [suites, setSuites] = useState<SuiteRecord[]>(buildSuites);
  const [scope, setScope] = useState<Scope>('all');
  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [tab, setTab] = useState<EvidenceTab>('steps');
  const [compact, setCompact] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [quarantined, setQuarantined] = useState<string[]>([]);
  const [manualResults, setManualResults] = useState<Record<string, ManualVerdict>>({});
  const [manualCursor, setManualCursor] = useState(0);
  const [shotView, setShotView] = useState<'actual' | 'expected'>('actual');
  const [overview, setOverview] = useState<OverviewState>(initialOverviewState);
  const [runsState, setRunsState] = useState<RunsState>(initialRunsState);
  const [log, setLog] = useState('Ready · 9 open failures across 6 suites');
  const [server, setServer] = useState<AppSnapshot['library']['server']>();
  const filterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.testron?.command({ type: 'set-shell-route', route: 'dashboard' });
    const unsubscribe = window.testron?.onSnapshot((snapshot) =>
      setServer(snapshot.library.server),
    );
    window.testron?.command({ type: 'request-snapshot' });
    return unsubscribe;
  }, []);

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
    if (test.failureId) {
      const index = queue.findIndex((failure) => failure.id === test.failureId);
      if (index >= 0) {
        setCursor(index);
        setView('triage');
        setLog(`Opened ${test.name}`);
        return;
      }
    }
    // A test with nothing to triage opens as itself: the board.
    setLog(`${test.name} · last run ${age(test.minutesAgo)} ago in ${test.seconds}s`);
    window.location.hash = '#/test';
  };

  const reorder = (suiteId: string, from: number, to: number) =>
    setSuites((current) =>
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
      {/* Run progress for the whole window — the one thing worth a full-width rule. */}
      <div className="h-[2px] w-full bg-line-soft">
        <div className="h-full w-[62%] bg-accent opacity-70" />
      </div>

      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-3 [-webkit-app-region:drag]">
        {/* Room for the macOS traffic lights. */}
        <div className="w-[74px] shrink-0" />

        <div className="flex items-center gap-2 [-webkit-app-region:no-drag]">
          <span className="ui-mono grid h-6 w-6 place-items-center rounded-[6px] bg-accent text-base font-bold text-accent-ink">
            T
          </span>
          <Button variant="ghost" size="lg" iconEnd="caret">
            Commerce app
          </Button>
        </div>

        <div className="flex items-center gap-2 rounded-md border border-line bg-surface px-2 py-1 [-webkit-app-region:no-drag]">
          <PulseDot label="Runs in flight" />
          <span className="text-base text-ink-2">3 runs in flight</span>
          <span className="ui-mono text-sm text-ink-3">· 22/35 tests</span>
        </div>

        <div className="ml-auto flex items-center gap-1.5 [-webkit-app-region:no-drag]">
          {server?.configured &&
            (server.authentication === 'signedOut' ? (
              <Button
                onClick={() => {
                  const email = window.prompt('Email for your Testron server account');
                  if (email) window.testron?.command({ type: 'login-server', email });
                }}
              >
                Sign in to server
              </Button>
            ) : server.authentication === 'authorizing' ? (
              <Badge tone="accent">Authorize code {server.userCode}</Badge>
            ) : (
              <>
                <Badge
                  tone={
                    server.status === 'conflicted'
                      ? 'critical'
                      : server.status === 'offline' || server.status === 'error'
                        ? 'warning'
                        : server.status === 'synced'
                          ? 'good'
                          : 'neutral'
                  }
                  icon={server.status === 'conflicted' ? 'alert' : 'check'}
                >
                  {server.status === 'conflicted' ? 'Sync conflict' : server.status}
                </Badge>
                <Button icon="rerun" onClick={() => window.testron?.command({ type: 'sync-now' })}>
                  Sync
                </Button>
              </>
            ))}
          <Button icon="search" kbd="⌘K" onClick={() => setLog('Jump to… · not wired up yet')}>
            Jump to…
          </Button>
          <IconButton
            icon={theme === 'dark' ? 'sun' : 'moon'}
            label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            onClick={toggle}
          />
          <IconButton
            icon="density"
            label="Row density"
            active={compact}
            aria-pressed={compact}
            onClick={() => setCompact((current) => !current)}
          />
          <IconButton
            icon="focus"
            label="Focus mode — hide the context rail"
            active={focusMode}
            aria-pressed={focusMode}
            onClick={() => setFocusMode((current) => !current)}
          />
          <Avatar initials="NS" className="ml-1" />
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
          totals={totals}
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
          onReorder={reorder}
          onLog={setLog}
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
    </main>
  );
};
