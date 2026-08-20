import { useEffect, useMemo, useState } from 'react';

import type { Step } from '@testron/domain/steps/schema';
import type { AppCommand, AppSnapshot, VerifyAssertion } from '../../preload/api';

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

const assertionOptions: { value: VerifyAssertion; label: string }[] = [
  { value: 'visible', label: 'Visible' },
  { value: 'hidden', label: 'Hidden' },
  { value: 'textContains', label: 'Text contains' },
  { value: 'textEquals', label: 'Text equals' },
  { value: 'value', label: 'Input value' },
  { value: 'enabled', label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' },
  { value: 'checked', label: 'Checked' },
  { value: 'unchecked', label: 'Unchecked' },
  { value: 'countExactly', label: 'Count exactly' },
  { value: 'countAtLeast', label: 'Count at least' },
];

const StepEditor = ({
  step,
  index,
  command,
}: {
  step: Step;
  index: number;
  command: (command: AppCommand) => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(step);
  useEffect(() => setDraft(step), [step]);

  const setString = (value: string): void => {
    switch (draft.kind) {
      case 'navigate':
        setDraft({ ...draft, url: value });
        break;
      case 'fill':
        setDraft(
          draft.secret
            ? {
                ...draft,
                secret: {
                  environmentVariable: value
                    .replace(/[^a-z0-9_]+/gi, '_')
                    .replace(/^[^a-z]+/i, '')
                    .toUpperCase(),
                },
              }
            : { ...draft, value },
        );
        break;
      case 'selectOption':
        setDraft({ ...draft, value });
        break;
      case 'press':
        setDraft({ ...draft, key: value });
        break;
      case 'assertUrlPath':
        setDraft({ ...draft, expected: value });
        break;
      case 'assertElement':
        if (draft.assertion.type === 'text' || draft.assertion.type === 'value')
          setDraft({ ...draft, assertion: { ...draft.assertion, expected: value } });
        else if (draft.assertion.type === 'count')
          setDraft({
            ...draft,
            assertion: { ...draft.assertion, expected: Math.max(0, Number.parseInt(value) || 0) },
          });
        break;
    }
  };
  const stringValue = (() => {
    switch (draft.kind) {
      case 'navigate':
        return draft.url;
      case 'fill':
        return draft.secret?.environmentVariable ?? draft.value;
      case 'selectOption':
        return draft.value;
      case 'press':
        return draft.key;
      case 'assertUrlPath':
        return draft.expected;
      case 'assertElement':
        return draft.assertion.type === 'text' || draft.assertion.type === 'value'
          ? draft.assertion.expected
          : draft.assertion.type === 'count'
            ? String(draft.assertion.expected)
            : undefined;
      default:
        return undefined;
    }
  })();
  const targeted = 'target' in draft ? draft : undefined;

  return (
    <span className="step-editor">
      <button aria-label={`Edit step ${index + 1}`} onClick={() => setEditing(!editing)}>
        ✎
      </button>
      {editing && (
        <span className="editor-panel">
          {draft.kind === 'assertElement' && (
            <select
              aria-label="Assertion type"
              value={
                draft.assertion.type === 'text'
                  ? `text${draft.assertion.match === 'contains' ? 'Contains' : 'Equals'}`
                  : draft.assertion.type === 'value'
                    ? 'value'
                    : draft.assertion.type === 'count'
                      ? draft.assertion.operator === 'equals'
                        ? 'countExactly'
                        : 'countAtLeast'
                      : draft.assertion.type
              }
              onChange={(event) => {
                const value = event.target.value as VerifyAssertion;
                const next =
                  value === 'textContains'
                    ? { type: 'text' as const, match: 'contains' as const, expected: '' }
                    : value === 'textEquals'
                      ? { type: 'text' as const, match: 'equals' as const, expected: '' }
                      : value === 'value'
                        ? { type: 'value' as const, expected: '' }
                        : value === 'countExactly' || value === 'countAtLeast'
                          ? {
                              type: 'count' as const,
                              operator:
                                value === 'countExactly'
                                  ? ('equals' as const)
                                  : ('atLeast' as const),
                              expected: 0,
                            }
                          : {
                              type: value as
                                | 'visible'
                                | 'hidden'
                                | 'enabled'
                                | 'disabled'
                                | 'checked'
                                | 'unchecked',
                            };
                setDraft({ ...draft, assertion: next });
              }}
            >
              {assertionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
          {stringValue !== undefined && (
            <input
              aria-label="Step value"
              value={stringValue}
              onChange={(event) => setString(event.target.value)}
            />
          )}
          {targeted && targeted.target.alternatives.length > 0 && (
            <select
              aria-label="Alternative locator"
              defaultValue=""
              onChange={(event) => {
                if (!event.target.value) return;
                command({
                  type: 'use-alternative-locator',
                  index,
                  alternativeIndex: Number(event.target.value),
                });
                setEditing(false);
              }}
            >
              <option value="">Use alternative locator…</option>
              {targeted.target.alternatives.map((locator, alternativeIndex) => (
                <option key={JSON.stringify(locator)} value={alternativeIndex}>
                  {locator.strategy}: {JSON.stringify(locator)}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => {
              command({ type: 'update-step', index, step: draft });
              setEditing(false);
            }}
          >
            Save
          </button>
        </span>
      )}
    </span>
  );
};

export const RecorderApp = () => {
  const [url, setUrl] = useState('http://127.0.0.1:4174');
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [projectName, setProjectName] = useState('');
  const [environmentName, setEnvironmentName] = useState('Local');
  const [environmentUrl, setEnvironmentUrl] = useState('http://127.0.0.1:4174');
  const [testIdAttribute, setTestIdAttribute] = useState('data-testid');
  const [testTitle, setTestTitle] = useState('');
  const [tab, setTab] = useState<'human' | 'source' | 'run'>('human');
  const [verifyAssertion, setVerifyAssertion] = useState<VerifyAssertion>('visible');
  const [timeoutSeconds, setTimeoutSeconds] = useState(30);
  const [reuseAuthState, setReuseAuthState] = useState(false);
  const [environmentVariables, setEnvironmentVariables] = useState<Record<string, string>>({});

  useEffect(() => {
    window.testron.command({ type: 'set-shell-route', route: 'recorder' });
    const unsubscribe = window.testron.onSnapshot(setSnapshot);
    window.testron.command({ type: 'request-snapshot' });
    return unsubscribe;
  }, []);

  const { library } = snapshot;
  const environments = useMemo(
    () =>
      library.environments.filter(
        (environment) => environment.projectId === library.selectedProjectId,
      ),
    [library],
  );
  const tests = useMemo(
    () => library.tests.filter((test) => test.projectId === library.selectedProjectId),
    [library],
  );
  const selectedEnvironment = library.environments.find(
    (environment) => environment.id === library.selectedEnvironmentId,
  );
  const requiredEnvironmentVariables = useMemo(
    () => [
      ...new Set(
        snapshot.steps.flatMap((step) =>
          step.kind === 'fill' && step.secret ? [step.secret.environmentVariable] : [],
        ),
      ),
    ],
    [snapshot.steps],
  );

  const navigate = (): void => window.testron.command({ type: 'navigate', url });
  const command = window.testron.command;

  return (
    <main className="toolbar recorder-app">
      <a className="back-to-dashboard" href="#/">
        ← Overview
      </a>
      <section className="controls">
        <div className="brand">
          <span className="brand-mark">T</span>
          <div>
            <strong>Testron</strong>
            <small>Local-first test recorder</small>
          </div>
        </div>
        <form
          className="url-form"
          onSubmit={(event) => {
            event.preventDefault();
            navigate();
          }}
        >
          <input aria-label="URL" value={url} onChange={(event) => setUrl(event.target.value)} />
          <button type="submit">Go</button>
        </form>
        <span className={`status ${snapshot.recording ? 'live' : ''}`}>
          {snapshot.status === 'recording'
            ? snapshot.captureMode === 'verify'
              ? '◆ Verify'
              : '● Recording'
            : snapshot.status === 'paused'
              ? 'Paused'
              : `${snapshot.steps.length} steps`}
        </span>
      </section>

      <section className="library" aria-label="Test library">
        <div className="entity">
          <label>Project</label>
          <select
            aria-label="Project"
            value={library.selectedProjectId ?? ''}
            onChange={(event) => command({ type: 'select-project', projectId: event.target.value })}
          >
            <option value="" disabled>
              Choose project
            </option>
            {library.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <input
            aria-label="New project name"
            placeholder="New project"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
          />
          <button
            disabled={!projectName.trim()}
            onClick={() => {
              command({ type: 'create-project', name: projectName });
              setProjectName('');
            }}
          >
            Add
          </button>
        </div>

        <div className="entity environment">
          <label>Environment</label>
          <select
            aria-label="Environment"
            value={library.selectedEnvironmentId ?? ''}
            disabled={!library.selectedProjectId}
            onChange={(event) => {
              const environment = library.environments.find(
                (candidate) => candidate.id === event.target.value,
              );
              command({ type: 'select-environment', environmentId: event.target.value });
              if (environment) {
                setUrl(environment.baseUrl);
                setEnvironmentUrl(environment.baseUrl);
                setTestIdAttribute(environment.testIdAttribute);
              }
            }}
          >
            <option value="" disabled>
              Choose environment
            </option>
            {environments.map((environment) => (
              <option key={environment.id} value={environment.id}>
                {environment.name}
              </option>
            ))}
          </select>
          <input
            aria-label="New environment name"
            placeholder="Name"
            value={environmentName}
            onChange={(event) => setEnvironmentName(event.target.value)}
          />
          <input
            aria-label="Environment base URL"
            placeholder="Base URL"
            value={environmentUrl}
            onChange={(event) => setEnvironmentUrl(event.target.value)}
          />
          <input
            aria-label="Test ID attribute"
            placeholder="Test ID attribute"
            value={testIdAttribute}
            onChange={(event) => setTestIdAttribute(event.target.value)}
          />
          <button
            disabled={!library.selectedProjectId || !environmentName.trim()}
            onClick={() => {
              if (!library.selectedProjectId) return;
              command({
                type: 'create-environment',
                projectId: library.selectedProjectId,
                name: environmentName,
                baseUrl: environmentUrl,
                testIdAttribute,
              });
            }}
          >
            Add
          </button>
        </div>

        <div className="entity">
          <label>Test</label>
          <select
            aria-label="Test"
            value={library.selectedTestId ?? ''}
            disabled={!library.selectedProjectId}
            onChange={(event) => command({ type: 'select-test', testId: event.target.value })}
          >
            <option value="" disabled>
              Choose test
            </option>
            {tests.map((test) => (
              <option key={test.id} value={test.id}>
                {test.title}
              </option>
            ))}
          </select>
          <input
            aria-label="New test title"
            placeholder="New test title"
            value={testTitle}
            onChange={(event) => setTestTitle(event.target.value)}
          />
          <button
            disabled={
              !library.selectedProjectId || !library.selectedEnvironmentId || !testTitle.trim()
            }
            onClick={() => {
              if (!library.selectedProjectId || !library.selectedEnvironmentId) return;
              command({
                type: 'create-test',
                projectId: library.selectedProjectId,
                environmentId: library.selectedEnvironmentId,
                title: testTitle,
              });
              setTestTitle('');
            }}
          >
            Add
          </button>
        </div>
      </section>

      <section className="recording-actions">
        {snapshot.status !== 'recording' && snapshot.status !== 'paused' ? (
          <button
            className="record"
            disabled={library.projects.length > 0 && !library.selectedTestId}
            onClick={() => command({ type: 'start-recording' })}
          >
            Start recording
          </button>
        ) : snapshot.status === 'recording' ? (
          <button className="pause" onClick={() => command({ type: 'pause-recording' })}>
            Pause
          </button>
        ) : (
          <button className="record" onClick={() => command({ type: 'resume-recording' })}>
            Resume
          </button>
        )}
        <button
          disabled={snapshot.steps.length === 0}
          onClick={() => command({ type: 'undo-step' })}
        >
          Undo
        </button>
        <button
          className="finish"
          disabled={!['recording', 'paused'].includes(snapshot.status)}
          onClick={() => command({ type: 'finish-recording' })}
        >
          Finish
        </button>
        {snapshot.status === 'recording' && (
          <>
            <button
              className={snapshot.captureMode === 'record' ? 'mode-active' : ''}
              onClick={() =>
                command({ type: 'set-capture-mode', mode: 'record', assertion: verifyAssertion })
              }
            >
              Record
            </button>
            <button
              className={snapshot.captureMode === 'verify' ? 'verify mode-active' : ''}
              onClick={() =>
                command({ type: 'set-capture-mode', mode: 'verify', assertion: verifyAssertion })
              }
            >
              Verify
            </button>
            <select
              aria-label="Assertion"
              value={verifyAssertion}
              onChange={(event) => {
                const assertion = event.target.value as VerifyAssertion;
                setVerifyAssertion(assertion);
                command({ type: 'set-capture-mode', mode: 'verify', assertion });
              }}
            >
              {assertionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              disabled={!snapshot.currentUrl}
              onClick={() => {
                try {
                  command({
                    type: 'add-url-path-assertion',
                    expected: new URL(snapshot.currentUrl).pathname,
                  });
                } catch {
                  /* The button is disabled until a valid page has loaded. */
                }
              }}
            >
              Verify URL path
            </button>
          </>
        )}
        {selectedEnvironment && <small>Using {selectedEnvironment.testIdAttribute}</small>}
      </section>

      <section className="review">
        <div className="review-header">
          <div className="tabs">
            <button className={tab === 'human' ? 'active' : ''} onClick={() => setTab('human')}>
              Human-readable
            </button>
            <button className={tab === 'source' ? 'active' : ''} onClick={() => setTab('source')}>
              Playwright
            </button>
            <button className={tab === 'run' ? 'active' : ''} onClick={() => setTab('run')}>
              Run & diagnose
            </button>
          </div>
          <div className="export-actions">
            {snapshot.replay.status === 'running' ? (
              <button className="finish" onClick={() => command({ type: 'cancel-run' })}>
                Cancel run
              </button>
            ) : (
              <button
                className="record"
                disabled={!library.selectedTestId || snapshot.steps.length === 0}
                onClick={() => {
                  setTab('run');
                  command({
                    type: 'run-test',
                    environmentVariables,
                    timeoutMs: timeoutSeconds * 1_000,
                    reuseAuthState,
                  });
                }}
              >
                Run test
              </button>
            )}
            <button disabled={!snapshot.source} onClick={() => command({ type: 'copy-source' })}>
              Copy
            </button>
            <button disabled={!snapshot.source} onClick={() => command({ type: 'export-source' })}>
              Export .spec.ts
            </button>
          </div>
        </div>
        <div className="human" hidden={tab !== 'human'}>
          <ol>
            {snapshot.descriptions.length === 0 ? (
              <li className="empty">Create a test, start recording, then use the page below.</li>
            ) : (
              snapshot.descriptions.map((description, index) => (
                <li key={`${index}-${description}`}>
                  <span className="step-copy">
                    {description}
                    {snapshot.stepWarnings[index]?.map((warning) => (
                      <small className="quality-warning" key={warning}>
                        ⚠ {warning}
                      </small>
                    ))}
                  </span>
                  <span className="step-actions">
                    <StepEditor step={snapshot.steps[index]} index={index} command={command} />
                    <button
                      aria-label={`Duplicate step ${index + 1}`}
                      onClick={() => command({ type: 'duplicate-step', index })}
                    >
                      ⧉
                    </button>
                    <button
                      aria-label={`Move step ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => command({ type: 'move-step', index, direction: -1 })}
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`Move step ${index + 1} down`}
                      disabled={index === snapshot.steps.length - 1}
                      onClick={() => command({ type: 'move-step', index, direction: 1 })}
                    >
                      ↓
                    </button>
                    <button
                      aria-label={`Delete step ${index + 1}`}
                      onClick={() => command({ type: 'delete-step', index })}
                    >
                      ×
                    </button>
                  </span>
                </li>
              ))
            )}
          </ol>
        </div>
        <div className="source" hidden={tab !== 'source'}>
          <pre>{snapshot.source || '// Generated source appears here'}</pre>
        </div>
        <div className="run-results" hidden={tab !== 'run'}>
          <div className="run-config">
            <label>
              Timeout
              <input
                aria-label="Run timeout in seconds"
                type="number"
                min="1"
                max="600"
                value={timeoutSeconds}
                onChange={(event) => setTimeoutSeconds(Number(event.target.value))}
              />
              seconds
            </label>
            <label>
              <input
                type="checkbox"
                checked={reuseAuthState}
                onChange={(event) => setReuseAuthState(event.target.checked)}
              />
              Reuse auth for this environment (revision {selectedEnvironment?.authRevision ?? 1})
            </label>
            <button onClick={() => command({ type: 'clear-auth-state' })}>Clear auth</button>
            {requiredEnvironmentVariables.map((name) => (
              <label key={name}>
                {name}
                <input
                  aria-label={`Environment variable ${name}`}
                  type="password"
                  value={environmentVariables[name] ?? ''}
                  onChange={(event) =>
                    setEnvironmentVariables((current) => ({
                      ...current,
                      [name]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
          </div>
          <div className={`run-summary ${snapshot.replay.status}`}>
            Run: {snapshot.replay.status}
            {snapshot.replay.durationMs !== undefined && ` · ${snapshot.replay.durationMs} ms`}
          </div>
          {snapshot.replay.error && <div className="failure-detail">{snapshot.replay.error}</div>}
          <ol className="replay-steps">
            {snapshot.replay.steps.map((result) => (
              <li className={result.status} key={result.index}>
                <strong>{result.status}</strong> {result.action}
                {result.locator && <code>Locator: {result.locator}</code>}
                {result.error && <code className="failure-detail">Error: {result.error}</code>}
                {result.pageUrl && <code>Page URL: {result.pageUrl}</code>}
              </li>
            ))}
          </ol>
          {(snapshot.replay.screenshotPath || snapshot.replay.tracePath) && (
            <div className="artifacts">
              {snapshot.replay.screenshotPath && <>Screenshot: {snapshot.replay.screenshotPath}</>}
              {snapshot.replay.tracePath && <> · Trace: {snapshot.replay.tracePath}</>}
            </div>
          )}
        </div>
        {snapshot.warning && <div className="warning">{snapshot.warning}</div>}
      </section>
    </main>
  );
};
