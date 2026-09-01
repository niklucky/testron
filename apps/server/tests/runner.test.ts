import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { Step } from '@testron/domain/steps/schema';
import { ServerPlaywrightRunner } from '../src/test-runs/runner.js';

const directories: string[] = [];
const artifacts = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), 'testron-server-run-'));
  directories.push(directory);
  return directory;
};
const metadata = { recordedAt: '2026-01-01T00:00:00.000Z' };
const target = {
  primary: { strategy: 'testId' as const, attribute: 'data-testid', value: 'name' },
  alternatives: [],
};

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('ServerPlaywrightRunner', () => {
  it('executes structured steps and returns per-step feedback', async () => {
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
    const result = await new ServerPlaywrightRunner().run({
      steps,
      environmentVariables: {},
      timeoutMs: 5_000,
      artifactsDirectory: await artifacts(),
    });
    expect(result).toMatchObject({ status: 'passed', error: null });
    expect(result.steps.map((step) => step.status)).toEqual(['passed', 'passed', 'passed']);
    expect(result.steps[1]?.action).toContain('Fill');
    expect(result.screenshotPath).toBeNull();
    expect(result.videoPath).toBeNull();
  });

  it('retains a screenshot and video when a step fails', async () => {
    const directory = await artifacts();
    const result = await new ServerPlaywrightRunner().run({
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
          variable: { name: 'missingName' },
          metadata,
        },
      ],
      environmentVariables: {},
      timeoutMs: 5_000,
      artifactsDirectory: directory,
    });
    expect(result.status).toBe('failed');
    expect(result.steps.at(-1)).toMatchObject({ status: 'failed' });
    expect(result.screenshotPath && existsSync(result.screenshotPath)).toBe(true);
    expect(result.videoPath && existsSync(result.videoPath)).toBe(true);
  });
});
