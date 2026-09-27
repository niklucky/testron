import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { TestCase, TestResult } from '@playwright/test/reporter';
import { afterEach, expect, it, vi } from 'vitest';
import TestronReporter from '../src/run-reporter';

const mocks = vi.hoisted(() => ({
  report: vi.fn().mockResolvedValue({}),
  config: { server: 'https://testron.example', projectId: 'project', repositoryId: 'repo' },
}));
vi.mock('../src/config', () => ({ loadConfig: async () => mocks.config }));
vi.mock('../src/sync', () => ({
  apiClient: () => ({ sync: { report: { mutate: mocks.report } } }),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it.each([
  ['true', 'ci'],
  ['false', 'repository-local'],
  ['1', 'repository-local'],
  [undefined, 'repository-local'],
])('reports CI=%s as %s', async (ci, expectedSource) => {
  const root = await mkdtemp(path.join(tmpdir(), 'testron-reporter-'));
  try {
    vi.stubEnv('CI', ci);
    vi.stubEnv('TESTRON_API_KEY', 'test-key');
    vi.stubEnv('TESTRON_CONFIG_HOME', root);
    await mkdir(path.join(root, '.testron'));
    const revision = { id: 'revision', number: 1 };
    await writeFile(
      path.join(root, '.testron/state.json'),
      JSON.stringify({
        binding: JSON.stringify(Object.values(mocks.config)),
        tests: { test: revision },
      }),
    );
    const file = path.join(root, 'test.spec.ts');
    await writeFile(file, '// test source');
    const reporter = new TestronReporter({ cwd: root, environmentId: 'environment' });
    reporter.onTestEnd(
      {
        annotations: [{ type: 'testron.id', description: 'test' }],
        location: { file },
        parent: { project: () => ({ name: 'chromium' }) },
      } as unknown as TestCase,
      {
        status: 'passed',
        startTime: new Date(),
        duration: 10,
        errors: [],
        retry: 0,
      } as unknown as TestResult,
    );
    expect(await reporter.onEnd()).toBeUndefined();
    expect(mocks.report).toHaveBeenCalledWith(
      expect.objectContaining({ source: expectedSource, testRevision: revision, status: 'passed' }),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
