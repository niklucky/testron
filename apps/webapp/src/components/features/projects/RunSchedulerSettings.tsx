import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { nextCronOccurrence } from '@testron/domain/scheduling/cron';
import type { LibrarySnapshot } from '../../../lib/library';
import { Button, IconButton } from '../../ui/design';

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
  const environments = useMemo(
    () => library.environments.filter((environment) => environment.projectId === projectId),
    [library.environments, projectId],
  );
  const tests = useMemo(
    () => library.tests.filter((test) => test.projectId === projectId),
    [library.tests, projectId],
  );
  const [selectedId, setSelectedId] = useState<string | 'new'>(schedules[0]?.id ?? 'new');
  const selected = schedules.find((schedule) => schedule.id === selectedId);
  const [name, setName] = useState('Scheduled test run');
  const [cron, setCron] = useState('0 0 * * *');
  const [environmentId, setEnvironmentId] = useState(environments[0]?.id ?? '');
  const [testIds, setTestIds] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (selected) {
      setName(selected.name);
      setCron(selected.cron);
      setEnvironmentId(selected.environmentId);
      setTestIds(selected.testIds);
      setEnabled(selected.enabled);
    } else if (selectedId === 'new') {
      setName('Scheduled test run');
      setCron('0 0 * * *');
      setEnvironmentId(environments[0]?.id ?? '');
      setTestIds([]);
      setEnabled(true);
    }
  }, [environments, selected, selectedId]);

  const eligibleTests = useMemo(
    () => tests.filter((test) => test.environmentIds.includes(environmentId)),
    [environmentId, tests],
  );
  useEffect(() => {
    setTestIds((current) => current.filter((id) => eligibleTests.some((test) => test.id === id)));
  }, [environmentId]);

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
    .slice(0, 8);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !preview.next || !environmentId || testIds.length === 0) return;
    window.testron?.command(
      selected
        ? {
            type: 'update-run-schedule',
            scheduleId: selected.id,
            baseRevision: selected.revision,
            name,
            cron,
            environmentId,
            testIds,
            enabled,
          }
        : {
            type: 'create-run-schedule',
            projectId,
            name,
            cron,
            environmentId,
            testIds,
            enabled,
          },
    );
  };

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
            className={`rounded-md border p-3 ${preview.error ? 'border-bad/40 bg-bad/5' : 'border-line bg-plane'}`}
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
              <p className="text-bad">{preview.error}</p>
            )}
          </div>

          <label className="block">
            <span className="font-medium text-ink-2">Environment</span>
            <select
              className={fieldClass}
              value={environmentId}
              onChange={(event) => setEnvironmentId(event.target.value)}
            >
              {environments.map((environment) => (
                <option key={environment.id} value={environment.id}>
                  {environment.name}
                </option>
              ))}
            </select>
          </label>

          <fieldset>
            <legend className="font-medium text-ink-2">Tests</legend>
            <div className="mt-1.5 max-h-48 space-y-1 overflow-y-auto rounded-md border border-line bg-plane p-2">
              {eligibleTests.map((test) => (
                <label
                  key={test.id}
                  className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-raised"
                >
                  <input
                    type="checkbox"
                    checked={testIds.includes(test.id)}
                    onChange={(event) =>
                      setTestIds((current) =>
                        event.target.checked
                          ? [...current, test.id]
                          : current.filter((id) => id !== test.id),
                      )
                    }
                  />
                  <span className="truncate">{test.title}</span>
                </label>
              ))}
              {eligibleTests.length === 0 && (
                <p className="px-2 py-3 text-ink-3">No tests support this environment.</p>
              )}
            </div>
          </fieldset>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            <span className="font-medium text-ink-2">Enabled</span>
          </label>

          {jobs.length > 0 && (
            <div>
              <p className="font-medium text-ink-2">Recent server queue</p>
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
            </div>
          )}

          <div className="flex items-center gap-2 border-t border-line-soft pt-5">
            {selected && (
              <>
                <Button
                  type="button"
                  onClick={() =>
                    window.testron?.command({
                      type: 'enqueue-run-schedule',
                      scheduleId: selected.id,
                    })
                  }
                >
                  Run now
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    window.testron?.command({
                      type: 'delete-run-schedule',
                      scheduleId: selected.id,
                      baseRevision: selected.revision,
                    });
                    setSelectedId('new');
                  }}
                >
                  Delete
                </Button>
              </>
            )}
            <Button
              className="ml-auto"
              type="submit"
              variant="primary"
              disabled={!name.trim() || !preview.next || !environmentId || testIds.length === 0}
            >
              {selected ? 'Save schedule' : 'Create schedule'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};
