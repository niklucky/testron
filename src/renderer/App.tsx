import { useEffect, useState } from 'react';

import type { RecordingSnapshot } from '../main/recording/session';

const EMPTY_SNAPSHOT: RecordingSnapshot = {
  recording: false,
  currentUrl: '',
  steps: [],
  descriptions: [],
  source: '',
};

export const App = () => {
  const [url, setUrl] = useState('http://127.0.0.1:4174');
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);

  useEffect(() => {
    const unsubscribe = window.testron.onSnapshot(setSnapshot);
    window.testron.command({ type: 'request-snapshot' });
    return unsubscribe;
  }, []);

  const navigate = (): void => window.testron.command({ type: 'navigate', url });

  return (
    <main className="toolbar">
      <section className="controls">
        <div className="brand">
          <span className="brand-mark">T</span>
          <div>
            <strong>Testron</strong>
            <small>Phase 0 recorder</small>
          </div>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            navigate();
          }}
        >
          <input aria-label="URL" value={url} onChange={(event) => setUrl(event.target.value)} />
          <button type="submit">Go</button>
        </form>
        <button
          className={snapshot.recording ? 'stop' : 'record'}
          onClick={() =>
            window.testron.command({
              type: snapshot.recording ? 'stop-recording' : 'start-recording',
            })
          }
        >
          {snapshot.recording ? 'Stop recording' : 'Start recording'}
        </button>
        <span className={`status ${snapshot.recording ? 'live' : ''}`}>
          {snapshot.recording ? 'Recording' : `${snapshot.steps.length} steps`}
        </span>
      </section>
      <section className="output">
        <div className="human">
          <h2>Steps</h2>
          <ol>
            {snapshot.descriptions.length === 0 ? (
              <li className="empty">Start recording, press Go, then use the fixture below.</li>
            ) : (
              snapshot.descriptions.map((description, index) => (
                <li key={`${index}-${description}`}>{description}</li>
              ))
            )}
          </ol>
        </div>
        <div className="source">
          <h2>Playwright TypeScript</h2>
          <pre>{snapshot.source || '// Generated source appears here'}</pre>
        </div>
        {snapshot.warning && <div className="warning">{snapshot.warning}</div>}
      </section>
    </main>
  );
};
