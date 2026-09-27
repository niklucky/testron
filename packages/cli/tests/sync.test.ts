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
