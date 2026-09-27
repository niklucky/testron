import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  annotateExport,
  assignIds,
  collectFiles,
  discover,
  logicalTests,
  testId,
  validateTests,
} from '../src/discovery';
import { generateReferences, pull, type Api, type Catalog } from '../src/sync';
import { hash, sourcePath } from '../src/files';
import type { Config } from '../src/config';

const dirs: string[] = [];
const suite = randomUUID();
const config: Config = {
  server: 'http://127.0.0.1:4400',
  projectId: randomUUID(),
  repositoryId: randomUUID(),
  playwrightConfig: 'playwright.config.ts',
  environmentIds: [],
  supportFiles: [],
};
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'testron-cli-test-'));
  dirs.push(root);
  await symlink(
    path.resolve(import.meta.dirname, '../../../node_modules'),
    path.join(root, 'node_modules'),
    'dir',
  );
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await writeFile(
    path.join(root, 'playwright.config.ts'),
    `export default { testDir: '.', projects: [{name:'chromium'}, {name:'firefox'}] };`,
  );
  return root;
}
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe('Playwright collection and identity', () => {
  it('inherits suites, collapses project variants and inserts persistent IDs without running bodies', async () => {
    const root = await fixture();
    await writeFile(
      path.join(root, 'testron.generated.ts'),
      generateReferences({ suites: [{ id: suite, codeKey: 'Authentication' }] } as Catalog),
    );
    const source = `import { test } from '@playwright/test';
import { testron, suites } from './testron.generated';
test.describe('Login', testron({suite:suites.Authentication}), () => {
  test('signs in', async () => { throw new Error('must not execute'); });
  test('rejects password', { tag: '@smoke' }, async () => {});
});`;
    await writeFile(path.join(root, 'auth.spec.ts'), source);
    const raw = await discover(root, config);
    expect(raw).toHaveLength(4);
    const tests = logicalTests(raw);
    expect(tests).toHaveLength(2);
    validateTests(tests, new Set([suite]));
    await assignIds(root, tests, true);
    expect(await readFile(path.join(root, 'auth.spec.ts'), 'utf8')).toBe(source);
    await assignIds(root, tests, false);
    const after = logicalTests(await discover(root, config));
    expect(after.map(testId).every(Boolean)).toBe(true);
    expect(new Set(after.map(testId)).size).toBe(2);
    validateTests(after, new Set([suite]));
    expect(await assignIds(root, after, false)).toHaveProperty('size', 0);
    const files = await collectFiles(root, config, after);
    expect([...files.keys()]).toContain('testron.generated.ts');
    expect([...files.keys()]).toContain('playwright.config.ts');
  });

  it('rejects inherited test IDs and requires per-case IDs for parameterized declarations', async () => {
    const root = await fixture();
    await writeFile(
      path.join(root, 'auth.spec.ts'),
      `import {test} from '@playwright/test';
test.describe('bad group', {annotation: [{type:'testron.suite',description:'${suite}'},{type:'testron.id',description:'${randomUUID()}'}]}, () => {
  test('one', async()=>{});
});`,
    );
    const tests = logicalTests(await discover(root, config));
    expect(() => validateTests(tests, new Set([suite]))).toThrow('individual test');
    await writeFile(
      path.join(root, 'auth.spec.ts'),
      `import {test} from '@playwright/test';
for (const role of ['user','admin']) { test(role, {annotation:{type:'testron.suite',description:'${suite}'}}, async()=>{}); }`,
    );
    const cases = logicalTests(await discover(root, config));
    await expect(assignIds(root, cases, false)).rejects.toThrow('each generated case');
  });

  it('exports recorder tests with their existing identity and suite', () => {
    const id = randomUUID();
    const source = annotateExport(
      "import {test} from '@playwright/test';\ntest('recorded', async ({page}) => { await page.goto('/'); });",
      id,
      suite,
    );
    expect(source).toContain(id);
    expect(source).toContain(suite);
    expect(source).toContain("await page.goto('/')");
  });
});

describe('safe source pulls', () => {
  it('preserves local edits and refuses all writes on a conflict', async () => {
    const root = await fixture();
    const id = randomUUID();
    const catalog = {
      suites: [],
      environments: [],
      tests: [
        {
          test: {
            id,
            title: 'test',
            testSuiteId: null,
            currentRevision: { id: randomUUID(), number: 1 },
          },
          currentRevision: {
            content: {
              repository: {
                id: config.repositoryId,
                file: 'auth.spec.ts',
                files: ['auth.spec.ts', 'helper.ts'],
              },
            },
          },
        },
      ],
      files: [
        { path: 'auth.spec.ts', source: 'remote', hash: hash('remote') },
        { path: 'helper.ts', source: 'helper', hash: hash('helper') },
      ],
    } as unknown as Catalog;
    const api = { sync: { pull: { query: vi.fn().mockResolvedValue(catalog) } } } as unknown as Api;
    await writeFile(path.join(root, 'auth.spec.ts'), 'local edit');
    await expect(pull(root, config, api, { tests: true })).rejects.toThrow(
      'nothing was overwritten',
    );
    await expect(readFile(path.join(root, 'helper.ts'), 'utf8')).rejects.toThrow();
    expect(await readFile(path.join(root, 'auth.spec.ts'), 'utf8')).toBe('local edit');
    await writeFile(path.join(root, 'auth.spec.ts'), 'remote');
    await pull(root, config, api, { tests: true });
    await writeFile(path.join(root, 'auth.spec.ts'), 'new local edit');
    const result = await pull(root, config, api, { tests: true });
    expect(result.keptLocal).toEqual(['auth.spec.ts']);
    expect(await readFile(path.join(root, 'auth.spec.ts'), 'utf8')).toBe('new local edit');
    const before = await readFile(path.join(root, '.testron/state.json'), 'utf8');
    catalog.tests[0].test.currentRevision = { id: randomUUID(), number: 2 };
    await pull(root, config, api, {});
    expect(await readFile(path.join(root, '.testron/state.json'), 'utf8')).toBe(before);
  });

  it('rejects traversal and symlink destinations', async () => {
    const root = await fixture();
    await expect(sourcePath(root, '../outside.ts', true)).rejects.toThrow('Invalid source path');
    await expect(sourcePath(root, '.env', true)).rejects.toThrow('Invalid source path');
    await symlink(tmpdir(), path.join(root, 'escape'), 'dir');
    await expect(sourcePath(root, 'escape/test.ts', true)).rejects.toThrow('Symlink');
  });
});

describe('publication policy', () => {
  it('publishes only opted-in tests, supports nearest overrides and never infers environments', async () => {
    const root = await fixture();
    await writeFile(
      path.join(root, 'testron.generated.ts'),
      generateReferences({ suites: [{ id: suite, codeKey: 'Authentication' }] } as Catalog),
    );
    await writeFile(
      path.join(root, 'mixed.spec.ts'),
      `import {test} from '@playwright/test';
import {testron,suites} from './testron.generated';
test('local only, no suite', async()=>{});
test.describe('publish group', testron({suite:suites.Authentication,publish:true,execution:'ci-and-testron'}),()=>{
  test('shared', async()=>{});
  test('destructive', testron({execution:'ci-only'}), async()=>{});
  test('private', testron({publish:false}), async()=>{});
});
test('default CI only', testron({suite:suites.Authentication,publish:true}), async()=>{});`,
    );
    const mutate = vi.fn().mockImplementation(async (request) => ({
      dryRun: request.dryRun,
      files: [],
      tests: request.tests.map((test: { id: string }) => ({
        id: test.id,
        status: 'created',
        revision: null,
      })),
    }));
    const api = {
      sync: {
        pull: {
          query: vi.fn().mockResolvedValue({
            suites: [{ id: suite }],
            tests: [],
            environments: [{ id: randomUUID() }],
          }),
        },
        push: { mutate },
      },
    } as unknown as Api;
    const { push } = await import('../src/sync');
    await push(root, config, api, { file: 'mixed.spec.ts', dryRun: true });
    const payload = mutate.mock.calls[0]![0];
    expect(payload.environmentIds).toEqual([]);
    expect(
      payload.tests.map((test: { title: string; execution: string }) => [
        test.title,
        test.execution,
      ]),
    ).toEqual([
      ['shared', 'ci-only'],
      ['destructive', 'ci-only'],
      ['default CI only', 'ci-only'],
    ]);
    expect(await readFile(path.join(root, 'mixed.spec.ts'), 'utf8')).not.toContain('testron.id');
    await writeFile(
      path.join(root, 'unpublished.spec.ts'),
      "import {test} from '@playwright/test'; test('private',async()=>{});",
    );
    await expect(push(root, config, api, { file: 'unpublished.spec.ts' })).rejects.toMatchObject({
      code: 'NO_PUBLISHED_TESTS',
    });
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('fails on malformed native annotations rather than guessing eligibility', async () => {
    const root = await fixture();
    await writeFile(
      path.join(root, 'bad.spec.ts'),
      `import {test} from '@playwright/test';
      test('bad',{annotation:[{type:'testron.publish',description:'yes'},{type:'testron.execution',description:'production'}]},async()=>{});`,
    );
    const [test] = logicalTests(await discover(root, config));
    const { publication, executionMode } = await import('../src/discovery');
    expect(() => publication(test!)).toThrow('publish: true or false');
    expect(() => executionMode(test!)).toThrow('Unknown execution mode');
  });

  it('pulls native tests with their identity, policy, a local fixture and no remote target', async () => {
    const root = await fixture();
    const id = randomUUID();
    const catalog = {
      suites: [{ id: suite, codeKey: 'Authentication' }],
      environments: [],
      files: [],
      tests: [
        {
          test: {
            id,
            title: 'dashboard',
            testSuiteId: suite,
            currentRevision: { id: randomUUID(), number: 1 },
          },
          currentRevision: {
            content: {
              stepSchemaVersion: 1,
              title: 'dashboard',
              environmentIds: [randomUUID()],
              prerequisites: [],
              steps: [],
              profileId: randomUUID(),
              source:
                "import {test} from '@playwright/test'; test('dashboard',async({page})=>{await page.goto('https://production.example/dashboard');});",
            },
          },
        },
      ],
    } as unknown as Catalog;
    const api = { sync: { pull: { query: vi.fn().mockResolvedValue(catalog) } } } as unknown as Api;
    await pull(root, { ...config, importDir: 'tests/e2e/imported' }, api, { tests: true });
    const source = await readFile(path.join(root, `tests/e2e/imported/${id}.spec.ts`), 'utf8');
    expect(source).not.toContain('production.example');
    expect(source).toContain("page.goto('/dashboard')");
    const [test] = logicalTests(await discover(root, config));
    const { publication, executionMode } = await import('../src/discovery');
    expect(testId(test!)).toBe(id);
    expect(publication(test!)).toBe(true);
    expect(executionMode(test!)).toBe('ci-and-testron');
    expect(test!.annotations).toContainEqual(
      expect.objectContaining({ type: 'testron.local-auth' }),
    );
    expect(
      await readFile(path.join(root, 'tests/e2e/imported/testron.fixture.ts'), 'utf8'),
    ).toContain('TESTRON_BASE_URL');
    expect(
      JSON.parse(await readFile(path.join(root, '.testron/catalog.json'), 'utf8')).tests[0].origin,
    ).toBe('testron');
    expect(api.sync.pull.query).toHaveBeenCalledTimes(1);
  });
});

describe('imported local execution', () => {
  it('requires a local target and auth, ignores remote project defaults, and rejects test overrides', async () => {
    const root = await fixture();
    const { importedFixture } = await import('../src/export-test');
    await writeFile(path.join(root, 'testron.fixture.ts'), importedFixture);
    await writeFile(
      path.join(root, 'imported.spec.ts'),
      `import {test,expect} from './testron.fixture';
      test('uses local target', async({baseURL})=>{ expect(baseURL).toBe('http://127.0.0.1:3210'); });`,
    );
    const run = (target: string) =>
      promisify(execFile)(
        process.execPath,
        [path.join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--reporter=line'],
        { cwd: root, env: { ...process.env, TESTRON_BASE_URL: target, TESTRON_STORAGE_STATE: '' } },
      );
    await expect(run('')).rejects.toMatchObject({
      stdout: expect.stringContaining('Set TESTRON_BASE_URL'),
    });
    await expect(run('http://127.0.0.1:3210')).resolves.toMatchObject({
      stdout: expect.stringContaining('2 passed'),
    });
    await writeFile(
      path.join(root, 'playwright.config.ts'),
      `export default {testDir:'.',use:{baseURL:'https://production.example'}};`,
    );
    await expect(run('http://127.0.0.1:3210')).resolves.toMatchObject({
      stdout: expect.stringContaining('1 passed'),
    });
    await writeFile(
      path.join(root, 'imported.spec.ts'),
      `import {test} from './testron.fixture';
      test.use({baseURL:'https://production.example'});
      test('wrong target',async()=>{});`,
    );
    await expect(run('http://127.0.0.1:3210')).rejects.toMatchObject({
      stdout: expect.stringContaining('overrides TESTRON_BASE_URL'),
    });
    await writeFile(
      path.join(root, 'imported.spec.ts'),
      `import {test} from './testron.fixture';
      test('requires auth',{annotation:{type:'testron.local-auth',description:'required'}},async({storageState})=>{});`,
    );
    await expect(run('http://127.0.0.1:3210')).rejects.toMatchObject({
      stdout: expect.stringContaining('TESTRON_STORAGE_STATE'),
    });
  });

  it('rejects custom code and multiple recorded origins instead of changing their meaning', async () => {
    const { exportTestSource } = await import('../src/export-test');
    const content = {
      stepSchemaVersion: 1 as const,
      title: 'unsafe',
      environmentIds: [randomUUID()],
      prerequisites: [],
      steps: [],
    };
    expect(() =>
      exportTestSource(
        {
          ...content,
          source:
            "import {test} from '@playwright/test'; test('unsafe',async({page})=>{ await page.evaluate(()=>fetch('/delete')); });",
        },
        randomUUID(),
        suite,
      ),
    ).toThrow('custom code');
    expect(() =>
      exportTestSource(
        {
          ...content,
          source:
            "import {test} from '@playwright/test'; test('unsafe',async({page})=>{ await page.goto('https://one.example'); await page.goto('https://two.example'); });",
        },
        randomUUID(),
        suite,
      ),
    ).toThrow('multiple origins');
  });
});
