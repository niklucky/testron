import { useEffect, useState } from 'react';

type ApiStatus = 'checking' | 'available' | 'unavailable';

const statusCopy: Record<ApiStatus, string> = {
  checking: 'Connecting to the Testron API…',
  available: 'API connected',
  unavailable: 'Webapp ready — start the server to connect the API',
};

export const App = () => {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/health', { signal: controller.signal })
      .then((response) => setApiStatus(response.ok ? 'available' : 'unavailable'))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError'))
          setApiStatus('unavailable');
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="shell">
      <header className="header">
        <a className="brand" href="/" aria-label="Testron home">
          <span className="mark">T</span>
          <span>Testron</span>
        </a>
        <span className={`status status--${apiStatus}`}>
          <span className="status__dot" aria-hidden="true" />
          {statusCopy[apiStatus]}
        </span>
      </header>

      <section className="welcome">
        <p className="eyebrow">Web application</p>
        <h1>Your testing workspace is moving to the web.</h1>
        <p className="lede">
          Projects, tests, history, and settings will live here. Recording and local test runs stay
          securely inside the Testron desktop app.
        </p>
        <div className="next">
          <span>Foundation ready</span>
          <strong>Authentication and workspace screens are next.</strong>
        </div>
      </section>
    </main>
  );
};
