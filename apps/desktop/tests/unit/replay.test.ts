import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { Step } from '@testron/domain/steps/schema';
import { LocalReplayRunner } from '../../src/main/replay/runner';

const temporaryDirectories: string[] = [];
const metadata = { recordedAt: '2026-01-01T00:00:00.000Z' };
const target = {
  primary: { strategy: 'testId' as const, attribute: 'data-testid', value: 'name' },
  alternatives: [{ strategy: 'label' as const, text: 'Name' }],
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

const artifactDirectory = (): string => {
  const directory = mkdtempSync(path.join(tmpdir(), 'testron-replay-'));
  temporaryDirectories.push(directory);
  return directory;
};

describe('LocalReplayRunner', () => {
  it('reports progress for each structured step and writes a trace', async () => {
    const steps: Step[] = [
      {
        version: 1,
        kind: 'navigate',
        url: 'data:text/html,<label>Name<input data-testid="name"></label>',
        metadata,
      },
      { version: 1, kind: 'fill', target, value: 'Ada', metadata },
      {
        version: 1,
        kind: 'assertElement',
        target,
        assertion: { type: 'value', expected: 'Ada' },
        metadata,
      },
    ];
    const artifactsDirectory = artifactDirectory();
    const progress: string[] = [];

    const result = await new LocalReplayRunner().run({
      steps,
      environmentVariables: {},
      timeoutMs: 5_000,
      artifactsDirectory,
      onProgress: (snapshot) => progress.push(snapshot.status),
    });

    expect(result.status).toBe('passed');
    expect(result.steps.map((step) => step.status)).toEqual(['passed', 'passed', 'passed']);
    expect(result.steps[1]).toMatchObject({ action: 'Fill [data-testid="name"] with “Ada”' });
    expect(progress).toContain('running');
    expect(existsSync(path.join(artifactsDirectory, 'trace.zip'))).toBe(true);
  });

  it('reveals dynamically mounted content with hover before asserting it', async () => {
    const trigger = {
      primary: { strategy: 'testId' as const, attribute: 'data-testid', value: 'help' },
      alternatives: [],
    };
    const popover = {
      primary: { strategy: 'testId' as const, attribute: 'data-testid', value: 'popover' },
      alternatives: [],
    };
    const steps: Step[] = [
      {
        version: 1,
        kind: 'navigate',
        url: `data:text/html,${encodeURIComponent('<button data-testid="help" onmouseenter="document.body.insertAdjacentHTML(\'beforeend\', \'<div data-testid=popover>Details</div>\')">Help</button>')}`,
        metadata,
      },
      { version: 1, kind: 'hover', target: trigger, metadata },
      {
        version: 1,
        kind: 'assertElement',
        target: popover,
        assertion: { type: 'text', match: 'equals', expected: 'Details' },
        metadata,
      },
    ];

    const result = await new LocalReplayRunner().run({
      steps,
      environmentVariables: {},
      timeoutMs: 5_000,
      artifactsDirectory: artifactDirectory(),
      onProgress: () => undefined,
    });

    expect(result.status).toBe('passed');
    expect(result.steps[1]).toMatchObject({ action: 'Hover over [data-testid="help"]' });
  });

  it('associates a Playwright failure with its action, locator, URL, and screenshot', async () => {
    const steps: Step[] = [
      {
        version: 1,
        kind: 'navigate',
        url: 'data:text/html,<label>Name<input data-testid="name"></label>',
        metadata,
      },
      {
        version: 1,
        kind: 'fill',
        target,
        value: '',
        variable: { name: 'accountName' },
        metadata,
      },
    ];
    const artifactsDirectory = artifactDirectory();

    const result = await new LocalReplayRunner().run({
      steps,
      environmentVariables: {},
      timeoutMs: 5_000,
      artifactsDirectory,
      onProgress: () => undefined,
    });

    expect(result.status).toBe('failed');
    expect(result.steps[1]).toMatchObject({
      status: 'failed',
      locator: 'data-testid="name"',
    });
    expect(result.steps[1].error).toContain('Missing required profile variable: accountName');
    expect(result.steps[1].pageUrl).toContain('data:text/html');
    expect(existsSync(path.join(artifactsDirectory, 'failure.png'))).toBe(true);
    expect(existsSync(path.join(artifactsDirectory, 'trace.zip'))).toBe(true);
  });

  it('suppresses failure artifacts for a protected replay', async () => {
    const artifactsDirectory = artifactDirectory();
    const result = await new LocalReplayRunner().run({
      steps: [
        {
          version: 1,
          kind: 'navigate',
          url: 'data:text/html,<label>Name<input data-testid="name"></label>',
          metadata,
        },
        {
          version: 1,
          kind: 'fill',
          target,
          value: '',
          variable: { name: 'missingValue' },
          metadata,
        },
      ],
      environmentVariables: {},
      timeoutMs: 5_000,
      artifactsDirectory,
      initialStorageState: { cookies: [], origins: [] },
      protectSensitiveArtifacts: true,
      onProgress: () => undefined,
    });

    expect(result.status).toBe('failed');
    expect(result.screenshotPath).toBeUndefined();
    expect(result.tracePath).toBeUndefined();
    expect(existsSync(path.join(artifactsDirectory, 'failure.png'))).toBe(false);
    expect(existsSync(path.join(artifactsDirectory, 'trace.zip'))).toBe(false);
  });

  it('closes the browser at the run deadline', async () => {
    const artifactsDirectory = artifactDirectory();
    const result = await new LocalReplayRunner().run({
      steps: [
        {
          version: 1,
          kind: 'navigate',
          url: 'data:text/html,<p>Loaded</p>',
          metadata,
        },
        {
          version: 1,
          kind: 'click',
          target: {
            primary: { strategy: 'testId', attribute: 'data-testid', value: 'never-appears' },
            alternatives: [],
          },
          metadata,
        },
      ],
      environmentVariables: {},
      timeoutMs: 250,
      artifactsDirectory,
      onProgress: () => undefined,
    });

    expect(result.status).toBe('timedOut');
    expect(result.screenshotPath).toBeUndefined();
    expect(existsSync(path.join(artifactsDirectory, 'failure.png'))).toBe(false);
  });

  it('adds profile headers and cookies to browser requests', async () => {
    const crossOriginHeaders: Array<string | undefined> = [];
    const crossOriginServer = createServer((request, response) => {
      crossOriginHeaders.push(request.headers['x-profile-token'] as string | undefined);
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<p>Cross origin</p>');
    });
    await new Promise<void>((resolve) => crossOriginServer.listen(0, '127.0.0.1', resolve));
    const crossOriginAddress = crossOriginServer.address();
    if (!crossOriginAddress || typeof crossOriginAddress === 'string')
      throw new Error('Cross-origin fixture server did not start.');
    const crossOriginUrl = `http://127.0.0.1:${crossOriginAddress.port}/pixel.png`;
    const server = createServer((request, response) => {
      if (request.url === '/redirect') {
        response.writeHead(302, { location: crossOriginUrl });
        response.end();
        return;
      }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(
        `<p data-testid="evidence">${request.headers['x-profile-token'] ?? ''}|${request.headers.cookie ?? ''}</p><img src="${crossOriginUrl}">`,
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Fixture server did not start.');
    const url = `http://127.0.0.1:${address.port}/`;
    const steps: Step[] = [
      { version: 1, kind: 'navigate', url, metadata },
      {
        version: 1,
        kind: 'assertElement',
        target: {
          primary: { strategy: 'testId', attribute: 'data-testid', value: 'evidence' },
          alternatives: [],
        },
        assertion: { type: 'text', match: 'equals', expected: 'header-secret|sid=cookie-secret' },
        metadata,
      },
      { version: 1, kind: 'navigate', url: `${url}redirect`, metadata },
    ];

    try {
      const result = await new LocalReplayRunner().run({
        steps,
        environmentVariables: {},
        timeoutMs: 5_000,
        artifactsDirectory: artifactDirectory(),
        headers: { origin: url, values: { 'X-Profile-Token': 'header-secret' } },
        cookies: [{ name: 'sid', value: 'cookie-secret', url }],
        onProgress: () => undefined,
      });
      expect(result.status).toBe('passed');
      expect(crossOriginHeaders).toEqual([undefined, undefined]);
    } finally {
      await Promise.all(
        [server, crossOriginServer].map(
          (fixtureServer) =>
            new Promise<void>((resolve, reject) =>
              fixtureServer.close((error) => (error ? reject(error) : resolve())),
            ),
        ),
      );
    }
  });

  it('captures reusable cookies, local storage, and IndexedDB only when explicitly requested', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'set-cookie': 'access_token=cookie-token; Path=/; HttpOnly',
      });
      response.end(`<p data-testid="ready">pending</p><script>
        localStorage.setItem('accessToken', 'local-token');
        const request = indexedDB.open('testron-auth', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('session').put('Ada', 'user');
        request.onsuccess = () => document.querySelector('[data-testid=ready]').textContent = 'ready';
      </script>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Fixture server did not start.');
    const url = `http://127.0.0.1:${address.port}/`;
    const steps: Step[] = [
      { version: 1, kind: 'navigate', url, metadata },
      {
        version: 1,
        kind: 'assertElement',
        target: {
          primary: { strategy: 'testId', attribute: 'data-testid', value: 'ready' },
          alternatives: [],
        },
        assertion: { type: 'text', match: 'equals', expected: 'ready' },
        metadata,
      },
    ];
    try {
      const captured = await new LocalReplayRunner().run({
        steps,
        environmentVariables: {},
        timeoutMs: 5_000,
        artifactsDirectory: artifactDirectory(),
        captureStorageState: true,
        onProgress: (snapshot) => expect(snapshot).not.toHaveProperty('capturedStorageState'),
      });
      expect(captured.capturedStorageState?.cookies).toEqual([
        expect.objectContaining({ name: 'access_token', value: 'cookie-token' }),
      ]);
      expect(captured.capturedStorageState?.origins[0]?.localStorage).toContainEqual({
        name: 'accessToken',
        value: 'local-token',
      });
      expect(captured.capturedStorageState?.origins[0]?.indexedDB).toHaveLength(1);
      expect(existsSync(path.join(captured.tracePath ?? '', 'trace.zip'))).toBe(false);

      const ordinary = await new LocalReplayRunner().run({
        steps,
        environmentVariables: {},
        timeoutMs: 5_000,
        artifactsDirectory: artifactDirectory(),
        initialStorageState: captured.capturedStorageState,
        onProgress: () => undefined,
      });
      expect(ordinary.status).toBe('passed');
      expect(ordinary).not.toHaveProperty('capturedStorageState');
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
