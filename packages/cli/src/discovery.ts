import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import { z } from 'zod';
import type { Config } from './config';
import { atomicWrite, CliError, readOptional, sourcePath } from './files';

export interface DiscoveredTest {
  title: string;
  titlePath: string[];
  file: string;
  line: number;
  column: number;
  annotations: {
    type: string;
    description?: string;
    location?: { file: string; line: number; column: number };
  }[];
  project: string;
}
export async function discover(root: string, config: Config): Promise<DiscoveredTest[]> {
  root = await realpath(root);
  const dir = await mkdtemp(path.join(tmpdir(), 'testron-discovery-'));
  try {
    let cli: string;
    try {
      cli = createRequire(path.join(root, 'package.json')).resolve('@playwright/test/cli');
    } catch {
      throw new CliError('PLAYWRIGHT_MISSING', 'Install @playwright/test in this project first.');
    }
    const resultFile = path.join(dir, 'tests.json');
    const builtReporter = fileURLToPath(new URL('./reporter.cjs', import.meta.url));
    const reporter = existsSync(builtReporter)
      ? builtReporter
      : fileURLToPath(new URL('../dist/reporter.cjs', import.meta.url));
    const output = await new Promise<{ code: number | null; log: string }>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [cli, 'test', '--list', '--config', config.playwrightConfig, '--reporter', reporter],
        {
          cwd: root,
          env: { ...process.env, TESTRON_DISCOVERY_FILE: resultFile },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let log = '';
      child.stdout.on('data', (data) => {
        log = (log + data.toString()).slice(-12000);
      });
      child.stderr.on('data', (data) => {
        log = (log + data.toString()).slice(-12000);
      });
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
      }, 60_000);
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, log });
      });
    });
    const raw = await readOptional(resultFile);
    const report = raw
      ? (JSON.parse(raw) as { tests: DiscoveredTest[]; errors: string[] })
      : undefined;
    if (output.code !== 0 || !report || report.errors.length)
      throw new CliError('DISCOVERY_FAILED', 'Playwright could not collect tests.', {
        errors: report?.errors,
        output: output.log,
      });
    return report.tests.map((test) => ({
      ...test,
      file: path.relative(root, test.file).split(path.sep).join('/'),
    }));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function logicalTests(tests: DiscoveredTest[]) {
  const unique = new Map<string, DiscoveredTest>();
  for (const test of tests) {
    const key = JSON.stringify([test.file, test.line, test.column, test.titlePath]);
    const before = unique.get(key);
    if (before && JSON.stringify(before.annotations) !== JSON.stringify(test.annotations))
      throw new CliError(
        'VARIANT_METADATA_CONFLICT',
        `Project variants have different annotations: ${test.file}:${test.line}`,
      );
    unique.set(key, test);
  }
  return [...unique.values()];
}
export const testId = (test: DiscoveredTest) => {
  const annotations = test.annotations.filter((annotation) => annotation.type === 'testron.id');
  if (annotations.length > 1)
    throw new CliError('DUPLICATE_ID', `Multiple test IDs at ${test.file}:${test.line}`);
  const annotation = annotations[0];
  if (
    annotation?.location &&
    (annotation.location.line !== test.line || annotation.location.column !== test.column)
  )
    throw new CliError(
      'GROUP_ID_FORBIDDEN',
      `Put testron.id on the individual test, not its describe group: ${test.file}:${test.line}`,
    );
  return annotation?.description;
};
export const suiteId = (test: DiscoveredTest) =>
  test.annotations.filter((annotation) => annotation.type === 'testron.suite').at(-1)?.description;
export function validateTests(tests: DiscoveredTest[], suiteIds: Set<string>) {
  const ids = new Set<string>();
  for (const test of tests) {
    const id = testId(test);
    if (id && !z.uuid().safeParse(id).success)
      throw new CliError('INVALID_ID', `Invalid test UUID at ${test.file}:${test.line}`);
    if (id && ids.has(id))
      throw new CliError('DUPLICATE_ID', `Test ID ${id} is reused at ${test.file}:${test.line}`);
    if (id) ids.add(id);
    const suite = suiteId(test);
    if (!suite)
      throw new CliError(
        'SUITE_REQUIRED',
        `Assign a suite at ${test.file}:${test.line}, e.g. testron({ suite: suites.Authentication }).`,
      );
    if (!suiteIds.has(suite))
      throw new CliError(
        'SUITE_UNKNOWN',
        `Suite ${suite} does not exist in this project. Run testron pull.`,
      );
  }
}

// Locate declarations by Playwright's source location, never by a title regex.
function declaration(file: ts.SourceFile, test: DiscoveredTest) {
  let result: ts.CallExpression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const location = file.getLineAndCharacterOfPosition(node.getStart(file));
      if (location.line + 1 === test.line && location.character + 1 === test.column) result = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return result;
}
export async function assignIds(root: string, tests: DiscoveredTest[], dryRun: boolean) {
  const edits = new Map<
    string,
    { source: string; changes: { position: number; end: number; text: string }[] }
  >();
  const ids = new Map<string, string>();
  for (const test of tests) {
    if (testId(test)) continue;
    const location = `${test.file}:${test.line}:${test.column}`;
    if (
      tests.filter(
        (other) =>
          other.file === test.file && other.line === test.line && other.column === test.column,
      ).length > 1
    )
      throw new CliError(
        'PARAMETER_ID_REQUIRED',
        `Give each generated case its own stable testron.id at ${location}.`,
      );
    const absolute = await sourcePath(root, test.file);
    const source = edits.get(test.file)?.source ?? (await readFile(absolute, 'utf8'));
    const ast = ts.createSourceFile(
      test.file,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const call = declaration(ast, test);
    if (!call || (call.arguments.length !== 2 && call.arguments.length !== 3))
      throw new CliError(
        'ID_REQUIRED',
        `Add an explicit testron.id at ${location}; this declaration cannot be safely edited.`,
      );
    const id = randomUUID();
    ids.set(location, id);
    const details = call.arguments[1];
    const annotation = `{ type: 'testron.id', description: '${id}' }`;
    let change;
    if (call.arguments.length === 2) {
      change = {
        position: details.getStart(ast),
        end: details.getStart(ast),
        text: `{ annotation: ${annotation} }, `,
      };
    } else if (
      ts.isCallExpression(details) &&
      details.arguments.length === 1 &&
      ts.isObjectLiteralExpression(details.arguments[0]) &&
      details.expression.getText(ast) === 'testron'
    ) {
      const obj = details.arguments[0];
      change = {
        position: obj.getStart(ast) + 1,
        end: obj.getStart(ast) + 1,
        text: ` id: '${id}',`,
      };
    } else if (ts.isObjectLiteralExpression(details)) {
      const annotationProperty = details.properties.find(
        (property) => property.name?.getText(ast) === 'annotation',
      );
      if (annotationProperty && ts.isPropertyAssignment(annotationProperty)) {
        const value = annotationProperty.initializer;
        change = {
          position: value.getStart(ast),
          end: value.end,
          text: ts.isArrayLiteralExpression(value)
            ? `[${annotation}, ${value.elements.map((element) => element.getText(ast)).join(', ')}]`
            : `[${annotation}, ${value.getText(ast)}]`,
        };
      } else if (!annotationProperty && !details.properties.some(ts.isSpreadAssignment)) {
        change = {
          position: details.getStart(ast) + 1,
          end: details.getStart(ast) + 1,
          text: ` annotation: ${annotation},`,
        };
      }
    }
    if (!change)
      throw new CliError(
        'ID_REQUIRED',
        `Add an explicit testron.id at ${location}; computed test details cannot be safely edited.`,
      );
    const entry = edits.get(test.file) ?? { source, changes: [] };
    entry.changes.push(change);
    edits.set(test.file, entry);
  }
  if (!dryRun)
    for (const [file, { source, changes }] of edits) {
      let next = source;
      for (const change of changes.sort((a, b) => b.position - a.position))
        next = next.slice(0, change.position) + change.text + next.slice(change.end);
      await atomicWrite(await sourcePath(root, file), next);
    }
  return ids;
}

export async function collectFiles(root: string, config: Config, tests: DiscoveredTest[]) {
  const result = new Map<string, string>();
  const compiler = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
  const options = compiler.error
    ? {}
    : ts.parseJsonConfigFileContent(compiler.config, ts.sys, root).options;
  const visit = async (relative: string) => {
    if (result.has(relative)) return;
    if (/(^|\/)(\.auth|storage-state[^/]*|[^/]*\.pem|[^/]*\.key)(\/|$)/i.test(relative))
      throw new CliError('SENSITIVE_FILE', `Refusing to upload credential material: ${relative}`);
    const absolute = await sourcePath(root, relative);
    const source = await readFile(absolute, 'utf8');
    if (source.includes('\0'))
      throw new CliError('BINARY_FILE', `Only text sources can be synchronized: ${relative}`);
    result.set(relative, source);
    if (result.size > 200)
      throw new CliError('BUNDLE_TOO_LARGE', 'More than 200 source files are referenced.');
    if (!/\.[cm]?[jt]sx?$/.test(relative)) return;
    const ast = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true);
    const imports: string[] = [];
    const walk = (node: ts.Node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        imports.push(node.moduleSpecifier.text);
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          node.expression.getText(ast) === 'require') &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      )
        imports.push(node.arguments[0].text);
      ts.forEachChild(node, walk);
    };
    walk(ast);
    for (const specifier of imports) {
      const resolved = ts.resolveModuleName(specifier, absolute, options, ts.sys).resolvedModule;
      if (resolved && !resolved.isExternalLibraryImport) {
        const file = path.relative(root, resolved.resolvedFileName).split(path.sep).join('/');
        await visit(file);
      } else if (!resolved && specifier.startsWith('.'))
        throw new CliError(
          'IMPORT_NOT_FOUND',
          `Cannot resolve ${specifier} imported by ${relative}.`,
        );
    }
  };
  for (const test of tests) await visit(test.file);
  await visit(config.playwrightConfig);
  for (const file of [
    'package.json',
    'tsconfig.json',
    'package-lock.json',
    'pnpm-lock.yaml',
    'bun.lock',
    'yarn.lock',
  ])
    if ((await readOptional(path.join(root, file))) !== undefined) await visit(file);
  for (const file of config.supportFiles) await visit(file);
  return result;
}

export function annotateExport(source: string, id: string, suite: string | null): string {
  const ast = ts.createSourceFile('export.spec.ts', source, ts.ScriptTarget.Latest, true);
  const calls = ast.statements
    .filter(ts.isExpressionStatement)
    .map((statement) => statement.expression)
    .filter(
      (expression): expression is ts.CallExpression =>
        ts.isCallExpression(expression) && expression.expression.getText(ast) === 'test',
    );
  if (calls.length !== 1 || calls[0].arguments.length !== 2)
    throw new CliError(
      'SOURCE_EXPORT_UNSUPPORTED',
      `Test ${id} cannot be exported automatically. Its source must contain one standalone test declaration.`,
    );
  const annotations = [
    { type: 'testron.id', description: id },
    ...(suite ? [{ type: 'testron.suite', description: suite }] : []),
  ];
  const position = calls[0].arguments[1].getStart(ast);
  return (
    source.slice(0, position) +
    `{ annotation: ${JSON.stringify(annotations)} }, ` +
    source.slice(position)
  );
}
