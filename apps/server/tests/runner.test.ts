import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { chromium } from '@playwright/test';

import { afterEach, describe, expect, it, vi } from 'vitest';

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

const publicFixture = (redirect?: string) => {
  const launch = chromium.launch.bind(chromium);
  vi.spyOn(chromium, 'launch').mockImplementation(async (options) => {
    const browser = await launch(options);
    const newContext = browser.newContext.bind(browser);
    vi.spyOn(browser, 'newContext').mockImplementation(async (contextOptions) => {
      const context = await newContext(contextOptions);
      await context.route('https://example.test/**', (route) =>
        route.fulfill(
          redirect
            ? { status: 302, headers: { location: redirect } }
            : {
                contentType: 'text/html',
                body: '<label>Name<input data-testid="name"></label>',
              },
        ),
      );
      return context;
    });
    return browser;
  });
};

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('ServerPlaywrightRunner', () => {
  it('rejects exact code before starting a partial structured run', async () => {
    const result = await new ServerPlaywrightRunner().run({
      environmentUrl: 'https://example.test/',
      steps: [
        {
          version: 1,
          kind: 'code',
          code: "if (ready) await page.getByText('Continue').click();",
          reason: 'Conditional execution',
          metadata,
        },
      ],
      environmentVariables: {},
      timeoutMs: 5_000,
      artifactsDirectory: '/unused',
    });

    expect(result).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('Complete-spec execution'),
      steps: [{ index: 0, status: 'failed' }],
    });
  });

  it('rejects an invalid draft before launching the browser', async () => {
    const launch = vi.spyOn(chromium, 'launch');
    const result = await new ServerPlaywrightRunner().run({
      source: "test('incomplete',",
      steps: [{ version: 1, kind: 'navigate', url: 'https://example.test/', metadata }],
      environmentUrl: 'https://example.test/',
      environmentVariables: {},
      timeoutMs: 1_000,
      artifactsDirectory: await artifacts(),
    });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Fix the Playwright source');
    expect(launch).not.toHaveBeenCalled();
  });

  it('executes the source projection instead of stale persisted steps', async () => {
    publicFixture();
    const result = await new ServerPlaywrightRunner().run({
      source: `import { test, expect } from '@playwright/test';
        test('canonical', async ({ page }) => {
          await page.goto('https://example.test/');
          await page.getByTestId('name').fill('source value');
          await expect(page.getByTestId('name')).toHaveValue('source value');
        });`,
      steps: [],
      environmentUrl: 'https://example.test/',
      environmentVariables: {},
      timeoutMs: 5_000,
      artifactsDirectory: await artifacts(),
    });
    expect(result.status).toBe('passed');
    expect(result.steps).toHaveLength(3);
  });

  it('executes structured steps and returns per-step feedback', async () => {
    publicFixture();
    const steps: Step[] = [
      {
        version: 1,
        kind: 'navigate',
        url: 'https://example.test/',
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
      environmentUrl: 'https://example.test/',
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
    publicFixture();
    const directory = await artifacts();
    const result = await new ServerPlaywrightRunner().run({
      environmentUrl: 'https://example.test/',
      steps: [
        {
          version: 1,
          kind: 'navigate',
          url: 'https://example.test/',
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

  it('closes Chromium when context creation fails', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(chromium, 'launch').mockResolvedValue({
      newContext: vi.fn().mockRejectedValue(new Error('Invalid storage state')),
      close,
    } as never);
    const result = await new ServerPlaywrightRunner().run({
      environmentUrl: 'https://example.test',
      steps: [],
      environmentVariables: {},
      timeoutMs: 5_000,
      artifactsDirectory: await artifacts(),
    });
    expect(result).toMatchObject({ status: 'failed', error: 'Invalid storage state' });
    expect(close).toHaveBeenCalledOnce();
  });

  it.each(['direct', 'redirect'] as const)(
    'forces Chromium %s loopback requests through the public-only proxy',
    async (mode) => {
      let hits = 0;
      const server = createServer((_request, response) => {
        hits++;
        response.end('private');
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      try {
        if (mode === 'redirect') publicFixture(url);
        const result = await new ServerPlaywrightRunner({ allowedOrigins: [url] }).run({
          environmentUrl: 'https://example.test',
          steps: [
            {
              version: 1,
              kind: 'navigate',
              url: mode === 'redirect' ? 'https://example.test/' : url,
              metadata,
            },
          ],
          environmentVariables: {},
          timeoutMs: 5_000,
          captureArtifacts: false,
          artifactsDirectory: await artifacts(),
        });
        expect(result.status).toBe('failed');
        expect(result.error).toContain('egress denied');
        expect(hits).toBe(0);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
  );

  it.each(['file:///etc/passwd', 'ftp://example.test/file', 'data:text/html,secret'])(
    'rejects non-web navigation %s',
    async (url) => {
      const result = await new ServerPlaywrightRunner().run({
        environmentUrl: 'https://example.test',
        steps: [{ version: 1, kind: 'navigate', url, metadata }],
        environmentVariables: {},
        timeoutMs: 5_000,
        captureArtifacts: false,
        artifactsDirectory: await artifacts(),
      });
      expect(result.status).toBe('failed');
      expect(result.error).toContain('HTTP(S)');
    },
  );
});
