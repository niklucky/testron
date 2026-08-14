import { useEffect, useMemo, useState } from 'react';

import type { AppSnapshot } from '../preload/api';

const EMPTY_SNAPSHOT: AppSnapshot = {
  recording: false,
  status: 'idle',
  currentUrl: '',
  steps: [],
  descriptions: [],
  source: '',
  library: { projects: [], environments: [], tests: [] },
};

export const App = () => {
  const [url, setUrl] = useState('http://127.0.0.1:4174');
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [projectName, setProjectName] = useState('');
  const [environmentName, setEnvironmentName] = useState('Local');
  const [environmentUrl, setEnvironmentUrl] = useState('http://127.0.0.1:4174');
  const [testIdAttribute, setTestIdAttribute] = useState('data-testid');
  const [testTitle, setTestTitle] = useState('');
  const [tab, setTab] = useState<'human' | 'source'>('human');

  useEffect(() => {
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

  const navigate = (): void => window.testron.command({ type: 'navigate', url });
  const command = window.testron.command;

  return (
    <main className="toolbar">
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
            ? '● Recording'
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
          </div>
          <div className="export-actions">
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
                  <span>{description}</span>
                  <span className="step-actions">
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
        {snapshot.warning && <div className="warning">{snapshot.warning}</div>}
      </section>
    </main>
  );
};
