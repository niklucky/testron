import { useEffect, useMemo, useState } from 'react';

import { Badge, Button, Icon, IconButton, PulseDot, StatusDot, useTheme } from '../design';
import { sourceText } from '../record/codegen';
import type { RecordedStep } from '../record/types';
import { Branch, EmptyLane, Flow, Lane } from './Board';
import {
  AssertionCard,
  DetailCard,
  PrerequisiteCard,
  PrerequisitesEmpty,
  RunCard,
  StepArrow,
  StepCard,
} from './columns';
import { board as seed } from './data';
import { DeleteSheet, MoveSheet, PrerequisiteSheet, SourceSheet } from './sheets';
import { assertionsFor, specFor } from './spec';
import type { Assertion, Prerequisite, Run, TestBoard, TestDetail } from './types';

/**
 * One test, read left to right.
 *
 * What it is → what has to be true first → what it does → what it proves →
 * how it went. Each column is a lane of cards and the arrows between them
 * carry the sentence; nothing here is a form, so every field is edited where
 * it is read.
 *
 * The third and fourth columns are two halves of one list: actions in order,
 * and the assertions anchored between them. `spec.ts` puts them back together,
 * which is how an edit anywhere on the board produces a new spec — the
 * generator has always been a pure function of the steps.
 *
 * Shell only, and two of the five columns need a schema that does not exist
 * yet: prerequisites have no table (persistence/repository.ts stores projects,
 * environments, tests and steps), and runs are in-memory ReplaySnapshots that
 * end when the app closes. Both are additions, not adjustments.
 */
export const TestView = () => {
  const { theme, toggle } = useTheme();
  const [board, setBoard] = useState<TestBoard>(seed);
  const [selectedRun, setSelectedRun] = useState<string | undefined>(seed.runs[0]?.id);
  const [editing, setEditing] = useState<Prerequisite>();
  const [sheet, setSheet] = useState<'source' | 'move' | 'delete'>();
  const [detached, setDetached] = useState(false);
  const [source, setSource] = useState('');
  const [trashed, setTrashed] = useState(false);
  const [running, setRunning] = useState<{ runId: string; index: number }>();
  const [log, setLog] = useState('Last run failed on Staging · 26m ago');

  useEffect(() => {
    window.testron?.command({ type: 'set-shell-route', route: 'dashboard' });
  }, []);

  const lines = useMemo(() => specFor(board), [board]);
  const { detail, prerequisites, steps, assertions, runs } = board;

  const patch = (next: Partial<TestBoard>) => setBoard((current) => ({ ...current, ...next }));
  const touch = (message: string) => {
    patch({ detail: { ...detail, updatedAt: '16 Aug 2026' } });
    setLog(
      detached
        ? `${message} · source is detached, the file is unchanged`
        : `${message} · spec regenerated`,
    );
  };

  const newStep = (count: number): RecordedStep => ({
    id: `s${count + 1}-manual`,
    kind: 'click',
    label: 'New step',
    locator: "getByRole('button', { name: '' })",
    alternatives: [],
    at: 0,
  });

  const newAssertion = (count: number, afterStep: number): Assertion => ({
    id: `a${count + 1}-new`,
    afterStep,
    label: 'New assertion',
    locator: '',
    kind: 'visible',
    expected: '',
  });

  /**
   * Deleting a step takes its branch with it — the assertions that hung off it
   * move up to the step before, and everything below renumbers. Without this
   * the anchors would silently point at the wrong actions.
   */
  const removeStep = (index: number) => {
    const position = index + 1;
    patch({
      steps: steps.filter((_, entry) => entry !== index),
      assertions: assertions.map((assertion) =>
        assertion.afterStep >= position
          ? { ...assertion, afterStep: Math.max(1, assertion.afterStep - 1) }
          : assertion,
      ),
    });
    touch(`Step ${position} deleted`);
  };

  /* -- running -------------------------------------------------------------
     A run walks the step list, which is the point of the fifth column being
     next to the third: you watch it move. */
  useEffect(() => {
    if (!running) return;
    if (running.index >= steps.length) {
      setRunning(undefined);
      patch({
        runs: runs.map((run) =>
          run.id === running.runId
            ? { ...run, verdict: 'passed', seconds: 12.9, completed: steps.length }
            : run,
        ),
      });
      setLog(`Run finished · ${steps.length} steps passed on ${detail.environments[0]}`);
      return;
    }
    const timer = window.setTimeout(() => {
      setRunning({ runId: running.runId, index: running.index + 1 });
      patch({
        runs: runs.map((run) =>
          run.id === running.runId ? { ...run, completed: running.index + 1 } : run,
        ),
      });
    }, 420);
    return () => window.clearTimeout(timer);
  }, [running, steps.length]);

  const run = () => {
    const id = `r${runs.length + 1}-live`;
    patch({
      runs: [
        {
          id,
          verdict: 'running',
          environment: detail.environments[0] ?? 'Staging',
          seconds: 0,
          minutesAgo: 0,
          by: 'Nikita S.',
          trigger: 'manual',
          completed: 0,
        },
        ...runs,
      ],
    });
    setSelectedRun(id);
    setRunning({ runId: id, index: 0 });
    setLog(`Running on ${detail.environments[0] ?? 'Staging'}…`);
  };

  const selected = runs.find((entry) => entry.id === selectedRun);
  const failedStepId = selected?.verdict === 'failed' ? selected.failedStepId : undefined;
  const passedThrough = running ? running.index : 0;

  const lastVerdict = runs[0]?.verdict ?? 'passed';

  return (
    <main className="ui-root flex h-screen w-screen flex-col overflow-hidden bg-plane font-sans text-ink antialiased">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3 [-webkit-app-region:drag]">
        <div className="w-[74px] shrink-0" />
        <div className="flex min-w-0 items-center gap-1.5 [-webkit-app-region:no-drag]">
          <IconButton
            icon="arrowLeft"
            size="sm"
            label="Back to the dashboard"
            onClick={() => {
              window.location.hash = '#/';
            }}
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
                lastVerdict === 'passed' ? 'good' : lastVerdict === 'failed' ? 'critical' : 'accent'
              }
              label={`Last run ${lastVerdict}`}
            />
            <span className="truncate">{detail.name}</span>
          </span>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 [-webkit-app-region:no-drag]">
          <Badge tone={detached ? 'warning' : 'good'} icon={detached ? 'alert' : 'check'}>
            {detached ? 'Source detached' : 'Spec in sync'}
          </Badge>
          <IconButton
            icon={theme === 'dark' ? 'sun' : 'moon'}
            size="sm"
            label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            onClick={toggle}
          />
        </div>
      </header>

      {/* The four things you can do to a whole test, in the order they matter. */}
      <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line px-3">
        <Button
          variant="primary"
          icon={running ? 'pause' : 'play'}
          disabled={Boolean(running) || trashed}
          onClick={run}
        >
          {running ? 'Running…' : `Run on ${detail.environments[0] ?? 'Staging'}`}
        </Button>
        <Button icon="code" onClick={() => setSheet('source')}>
          Edit source
        </Button>
        <span className="mx-1 h-5 w-px bg-line" />
        <Button icon="suite" onClick={() => setSheet('move')} disabled={trashed}>
          Move
        </Button>
        <Button icon="trash" onClick={() => setSheet('delete')} disabled={trashed}>
          Delete
        </Button>

        <span className="ml-auto flex items-center gap-3 text-sm text-ink-3">
          {running && <PulseDot tone="accent" label="Running" />}
          <span>
            {steps.length} steps · {assertions.length} assertions
          </span>
          <span className="ui-mono">{detail.file}</span>
        </span>
      </div>

      {trashed && (
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-critical-wash px-3 text-base">
          <Icon name="trash" size={13} className="text-critical" />
          <span>In the trash · this test will not run.</span>
          <Button
            size="sm"
            className="ml-2"
            icon="rerun"
            onClick={() => {
              setTrashed(false);
              setLog('Restored from the trash');
            }}
          >
            Restore
          </Button>
        </div>
      )}

      <div
        className={`ui-scroll relative min-h-0 flex-1 overflow-x-auto ${trashed ? 'opacity-50' : ''}`}
      >
        <div className="flex h-full min-w-max items-stretch px-4 py-3">
          <Lane icon="test" title="Test" width={320}>
            <DetailCard
              detail={detail}
              onDetail={(next: TestDetail) => {
                patch({ detail: next });
                setLog('Test details updated');
              }}
              onLog={setLog}
            />
          </Lane>

          <Flow />

          <Lane
            icon="clipboard"
            title="Prerequisites"
            count={prerequisites.length}
            hint="True before step 1 runs."
            onAdd={() =>
              setEditing({
                id: `p${prerequisites.length + 1}`,
                kind: 'data',
                title: 'New prerequisite',
                detail: '',
                value: '',
              })
            }
          >
            {prerequisites.length === 0 && <PrerequisitesEmpty />}
            {prerequisites.map((prerequisite) => (
              <PrerequisiteCard
                key={prerequisite.id}
                prerequisite={prerequisite}
                onEdit={() => setEditing(prerequisite)}
                onDelete={() => {
                  patch({
                    prerequisites: prerequisites.filter((one) => one.id !== prerequisite.id),
                  });
                  setLog('Prerequisite removed');
                }}
              />
            ))}
          </Lane>

          <Flow />

          {/* Steps and assertions are one lane, because they are one sequence:
              an assertion hangs off the action that earns it. The branch is
              the anchor, so neither has to be kept in sync with the other. */}
          <Lane
            icon="steps"
            title="Steps"
            count={steps.length}
            hint={`${assertions.length} assertions hang off them.`}
            width={360}
            addLabel="Add a step"
            onAdd={() => {
              patch({ steps: [...steps, newStep(steps.length)] });
              touch('Step added');
            }}
          >
            {steps.map((step, index) => {
              const branch = assertionsFor(board, index);
              return (
                <div key={step.id}>
                  {index > 0 && <StepArrow />}
                  <StepCard
                    step={step}
                    index={index}
                    failed={step.id === failedStepId}
                    running={Boolean(running) && index === passedThrough}
                    passed={Boolean(running) && index < passedThrough}
                    onStep={(next: RecordedStep) => {
                      patch({ steps: steps.map((one) => (one.id === step.id ? next : one)) });
                      touch(`Step ${index + 1} edited`);
                    }}
                    onAddAssertion={() => {
                      patch({
                        assertions: [...assertions, newAssertion(assertions.length, index + 1)],
                      });
                      touch(`Assertion added after step ${index + 1}`);
                    }}
                    onDelete={() => removeStep(index)}
                  />

                  {branch.map((assertion, position) => (
                    <Branch key={assertion.id} last={position === branch.length - 1}>
                      <AssertionCard
                        assertion={assertion}
                        canMoveUp={index > 0}
                        canMoveDown={index < steps.length - 1}
                        onAssertion={(next: Assertion) => {
                          patch({
                            assertions: assertions.map((one) =>
                              one.id === assertion.id ? next : one,
                            ),
                          });
                          touch('Assertion edited');
                        }}
                        onMove={(direction) => {
                          patch({
                            assertions: assertions.map((one) =>
                              one.id === assertion.id
                                ? { ...one, afterStep: index + 1 + direction }
                                : one,
                            ),
                          });
                          touch(`Assertion moved to step ${index + 1 + direction}`);
                        }}
                        onDelete={() => {
                          patch({
                            assertions: assertions.filter((one) => one.id !== assertion.id),
                          });
                          touch('Assertion removed');
                        }}
                      />
                    </Branch>
                  ))}
                </div>
              );
            })}

            {assertions.length === 0 && (
              <EmptyLane>
                Nothing is proved yet. Hover a step and add what it should make true.
              </EmptyLane>
            )}
          </Lane>

          <Flow />

          <Lane icon="history" title="Runs" count={runs.length} hint="Newest first.">
            {runs.length === 0 && <EmptyLane>Never run.</EmptyLane>}
            {runs.map((entry: Run) => (
              <RunCard
                key={entry.id}
                run={entry}
                total={steps.length}
                selected={entry.id === selectedRun}
                onClick={() => {
                  setSelectedRun(entry.id);
                  setLog(
                    entry.verdict === 'failed'
                      ? 'Failing step highlighted in the steps column'
                      : `Run on ${entry.environment} · ${entry.seconds.toFixed(1)}s`,
                  );
                }}
                onLog={setLog}
              />
            ))}
          </Lane>
        </div>

        {sheet === 'source' && (
          <SourceSheet
            lines={lines}
            file={detail.file}
            detached={detached}
            source={source}
            onDetach={() => {
              setSource(sourceText(lines));
              setDetached(true);
            }}
            onSource={setSource}
            onReattach={() => {
              setDetached(false);
              setSource('');
            }}
            onClose={() => setSheet(undefined)}
            onLog={setLog}
          />
        )}

        {sheet === 'move' && (
          <MoveSheet
            current={{ project: detail.project, suite: detail.suite }}
            onMove={(destination) => {
              patch({ detail: { ...detail, ...destination } });
              setSheet(undefined);
              setLog(`Moved to ${destination.project} · ${destination.suite}`);
            }}
            onClose={() => setSheet(undefined)}
          />
        )}

        {sheet === 'delete' && (
          <DeleteSheet
            name={detail.name}
            onDelete={() => {
              setTrashed(true);
              setSheet(undefined);
              setLog('Moved to the trash · recoverable for 30 days');
            }}
            onClose={() => setSheet(undefined)}
          />
        )}

        {editing && (
          <PrerequisiteSheet
            prerequisite={editing}
            onSave={(next) => {
              patch({
                prerequisites: prerequisites.some((one) => one.id === next.id)
                  ? prerequisites.map((one) => (one.id === next.id ? next : one))
                  : [...prerequisites, next],
              });
              setEditing(undefined);
              setLog('Prerequisite saved');
            }}
            onClose={() => setEditing(undefined)}
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
            Record again
          </a>
        </span>
      </footer>
    </main>
  );
};
