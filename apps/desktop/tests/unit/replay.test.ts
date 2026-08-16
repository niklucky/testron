import { existsSync, mkdtempSync, rmSync } from 'node:fs';
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
        secret: { environmentVariable: 'ACCOUNT_NAME' },
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
    expect(result.steps[1].error).toContain('Missing required environment variable: ACCOUNT_NAME');
    expect(result.steps[1].pageUrl).toContain('data:text/html');
    expect(existsSync(path.join(artifactsDirectory, 'failure.png'))).toBe(true);
    expect(existsSync(path.join(artifactsDirectory, 'trace.zip'))).toBe(true);
  });
});
