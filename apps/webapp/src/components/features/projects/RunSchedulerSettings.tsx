import { useMemo, useState, type FormEvent } from 'react';

import { nextCronOccurrence } from '@testron/domain/scheduling/cron';
import type { LibrarySnapshot } from '../../../lib/library';
import { Button, IconButton } from '../../ui/design';
import { ScheduleTestPicker } from './ScheduleTestPicker';

const fieldClass =
  'mt-1.5 h-9 w-full rounded-md border border-line bg-plane px-3 text-ink outline-none focus:border-accent';

const presets = [
  { label: 'Every hour', cron: '0 * * * *' },
  { label: 'Every day at midnight UTC', cron: '0 0 * * *' },
] as const;

const dateTime = (value: Date, timeZone?: string): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(value);

export const RunSchedulerSettings = ({
  library,
  projectId,
}: {
  library: LibrarySnapshot;
  projectId: string;
}) => {
  const schedules = useMemo(
    () => (library.runSchedules ?? []).filter((schedule) => schedule.projectId === projectId),
    [library.runSchedules, projectId],
  );
  const [selectedId, setSelectedId] = useState<string | 'new'>(schedules[0]?.id ?? 'new');
  const selected = schedules.find((schedule) => schedule.id === selectedId);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)]">
      <aside className="min-h-0 overflow-y-auto border-r border-line p-3">
        <div className="flex items-center px-2 pb-2">
          <p className="font-semibold uppercase tracking-[0.1em] text-ink-3">Schedules</p>
          <IconButton
            icon="plus"
            size="sm"
            label="Add schedule"
            className="ml-auto"
            onClick={() => setSelectedId('new')}
          />
        </div>
        {schedules.map((schedule) => (
          <button
            key={schedule.id}
            type="button"
            className={`mb-1 w-full rounded-md px-2.5 py-2 text-left ${
              selectedId === schedule.id ? 'bg-accent-wash' : 'hover:bg-raised'
            }`}
            onClick={() => setSelectedId(schedule.id)}
          >
            <span className="block truncate font-medium">{schedule.name}</span>
            <span className="ui-mono mt-0.5 block text-xs text-ink-3">{schedule.cron} UTC</span>
            <span className="mt-0.5 block truncate text-xs text-ink-3">
              {schedule.nextRunAt
                ? `Next ${dateTime(new Date(schedule.nextRunAt))} local`
                : 'Paused'}
            </span>
          </button>
        ))}
        {schedules.length === 0 && selectedId !== 'new' && (
          <p className="px-2 py-4 text-ink-3">No schedules yet.</p>
        )}
      </aside>

      {/* Refresh queue data without replacing the user's in-progress form. */}
      <RunScheduleForm
        key={`${projectId}:${selected?.id ?? 'new'}`}
        library={library}
        projectId={projectId}
        selected={selected}
        onDelete={() => setSelectedId('new')}
      />
    </div>
  );
};

const RunScheduleForm = ({
  library,
  projectId,
  selected,
  onDelete,
}: {
  library: LibrarySnapshot;
  projectId: string;
  selected: NonNullable<LibrarySnapshot['runSchedules']>[number] | undefined;
  onDelete: () => void;
}) => {
  const environments = useMemo(
    () => library.environments.filter((environment) => environment.projectId === projectId),
    [library.environments, projectId],
  );
  const tests = useMemo(
    () =>
      library.tests.filter((test) => test.projectId === projectId && test.status !== 'requested'),
    [library.tests, projectId],
  );
  const [name, setName] = useState(selected?.name ?? 'Scheduled test run');
  const [cron, setCron] = useState(selected?.cron ?? '0 0 * * *');
  const [environmentId, setEnvironmentId] = useState(
    selected?.environmentId ?? environments[0]?.id ?? '',
  );
  const [testIds, setTestIds] = useState<string[]>(selected?.testIds ?? []);
  const [enabled, setEnabled] = useState(selected?.enabled ?? true);
  const [selectingTests, setSelectingTests] = useState(false);
  const eligibleTests = tests.filter((test) => test.environmentIds.includes(environmentId));
  const selectedTestIds = eligibleTests
    .filter((test) => testIds.includes(test.id))
    .map((test) => test.id);
  const preview = useMemo(() => {
    try {
      return { next: nextCronOccurrence(cron), error: undefined };
    } catch (error) {
      return { next: undefined, error: error instanceof Error ? error.message : 'Invalid cron' };
    }
  }, [cron]);
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time';
  const jobs = (library.serverRunJobs ?? [])
    .filter((job) => job.projectId === projectId)
    .sort((left, right) => Date.parse(right.queuedAt) - Date.parse(left.queuedAt))
    .slice(0, 5);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !preview.next || !environmentId || selectedTestIds.length === 0) return;
    window.testron?.command(
      selected
        ? {
            type: 'update-run-schedule',
            scheduleId: selected.id,
            baseRevision: selected.revision,
            name,
            cron,
            environmentId,
            testIds: selectedTestIds,
            enabled,
          }
        : {
            type: 'create-run-schedule',
            projectId,
            name,
            cron,
            environmentId,
            testIds: selectedTestIds,
            enabled,
          },
    );
  };

  return (
    <form className="min-h-0 overflow-y-auto p-6" onSubmit={submit}>
      <div className="max-w-[620px] space-y-5">
        <div>
          <h4 className="text-md font-semibold">{selected ? selected.name : 'New schedule'}</h4>
          <p className="mt-1 text-ink-3">
            Cron is stored and evaluated in UTC. Times below include your browser timezone.
          </p>
        </div>

        <label className="block">
          <span className="font-medium text-ink-2">Name</span>
          <input
            className={fieldClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="font-medium text-ink-2">Schedule</span>
            <select
              className={fieldClass}
              value={presets.some((preset) => preset.cron === cron) ? cron : 'custom'}
              onChange={(event) => {
                setCron(event.target.value === 'custom' ? '' : event.target.value);
              }}
            >
              {presets.map((preset) => (
                <option key={preset.cron} value={preset.cron}>
                  {preset.label}
                </option>
              ))}
              <option value="custom">Custom cron</option>
            </select>
          </label>
          <label className="block">
            <span className="font-medium text-ink-2">UTC cron</span>
            <input
              className={`${fieldClass} ui-mono`}
              value={cron}
              onChange={(event) => setCron(event.target.value)}
              placeholder="0 1 * * *"
            />
          </label>
        </div>

        <div
          className={`rounded-md border p-3 ${preview.error ? 'border-critical/40 bg-critical-wash' : 'border-line bg-plane'}`}
        >
          {preview.next ? (
            <>
              <p>
                <span className="font-medium">Next UTC:</span> {dateTime(preview.next, 'UTC')} UTC
              </p>
              <p className="mt-1 text-ink-2">
                <span className="font-medium">Your time:</span> {dateTime(preview.next)} (
                {localZone})
              </p>
            </>
          ) : (
            <p className="text-critical">{preview.error}</p>
          )}
        </div>

        <label className="block">
          <span className="font-medium text-ink-2">Environment</span>
          <select
            className={fieldClass}
            value={environmentId}
            onChange={(event) => {
              const nextEnvironmentId = event.target.value;
              setEnvironmentId(nextEnvironmentId);
              setTestIds((current) =>
                current.filter((id) =>
                  tests.some(
                    (test) => test.id === id && test.environmentIds.includes(nextEnvironmentId),
                  ),
                ),
              );
            }}
          >
            {environments.map((environment) => (
              <option key={environment.id} value={environment.id}>
                {environment.name}
              </option>
            ))}
          </select>
        </label>

        <div>
          <p className="font-medium text-ink-2">Tests</p>
          <div className="mt-1.5 flex items-center justify-between gap-3 rounded-md border border-line bg-plane p-3">
            <p className="text-ink-2">
              {selectedTestIds.length} of {eligibleTests.length} tests selected
            </p>
            <Button onClick={() => setSelectingTests(true)}>Select tests</Button>
          </div>
        </div>
        {selectingTests && (
          <ScheduleTestPicker
            tests={eligibleTests}
            suites={library.testSuites.filter((suite) => suite.projectId === projectId)}
            selectedTestIds={selectedTestIds}
            environmentName={
              environments.find((environment) => environment.id === environmentId)?.name ??
              'this environment'
            }
            onApply={(ids) => {
              setTestIds(ids);
              setSelectingTests(false);
            }}
            onCancel={() => setSelectingTests(false)}
          />
        )}

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          <span className="font-medium text-ink-2">Enabled</span>
        </label>

        {jobs.length > 0 && (
          <section aria-label="Latest 5 runs">
            <p className="font-medium text-ink-2">Latest 5 runs</p>
            <div className="mt-1.5 divide-y divide-line-soft rounded-md border border-line bg-plane">
              {jobs.map((job) => {
                const test = tests.find((candidate) => candidate.id === job.testId);
                return (
                  <div key={job.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate">{test?.title ?? job.testId}</span>
                    <span className="ui-mono text-xs text-ink-3">{job.status}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="flex items-center gap-2 border-t border-line-soft pt-5">
          {selected && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                window.testron?.command({
                  type: 'delete-run-schedule',
                  scheduleId: selected.id,
                  baseRevision: selected.revision,
                });
                onDelete();
              }}
            >
              Delete
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {selected && (
              <Button
                type="button"
                icon="play"
                onClick={() =>
                  window.testron?.command({
                    type: 'enqueue-run-schedule',
                    scheduleId: selected.id,
                  })
                }
              >
                Run now
              </Button>
            )}
            <Button
              type="submit"
              variant="primary"
              disabled={
                !name.trim() || !preview.next || !environmentId || selectedTestIds.length === 0
              }
            >
              {selected ? 'Save schedule' : 'Create schedule'}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
};
