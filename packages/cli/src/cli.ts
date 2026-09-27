import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { readFile, mkdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { TRPCClientError } from '@trpc/client';
import { z } from 'zod';
import { configSchema, loadConfig } from './config';
import { atomicWrite, CliError, jsonWrite, readOptional, sourcePath } from './files';
import { apiClient, generateReferences, pull, push } from './sync';

const help = `Testron CLI 0.1.0 — synchronize Playwright tests

  testron init --project <uuid> [--server <url>] [--agent]
  testron login --email <email> [--server <url>] [--password-stdin]
  testron key create [--name <name>] [--days <1-365>]
  testron key revoke --id <uuid>
  testron pull [--tests] [--test <uuid>] [--suite <codeKey|uuid>]
  testron push [-f <spec-file>] [--dry-run]
  testron docs

Global options: --cwd <directory>, --json, --help, --version
Init options: --environment <uuid> (repeatable), --repository <uuid>
Authentication: TESTRON_API_KEY, or the locally stored login/key.
Exit codes: 0 success, 1 operational error, 2 validation/conflict.
Full reference: https://testron.dev/docs/cli
`;
const parseOptions = () =>
  parseArgs({
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean' },
      json: { type: 'boolean' },
      cwd: { type: 'string' },
      server: { type: 'string' },
      project: { type: 'string' },
      repository: { type: 'string' },
      environment: { type: 'string', multiple: true },
      agent: { type: 'boolean' },
      email: { type: 'string' },
      'password-stdin': { type: 'boolean' },
      name: { type: 'string' },
      days: { type: 'string' },
      id: { type: 'string' },
      file: { type: 'string', short: 'f' },
      'dry-run': { type: 'boolean' },
      tests: { type: 'boolean' },
      test: { type: 'string' },
      suite: { type: 'string' },
    },
  });
const { positionals, values } = (() => {
  try {
    return parseOptions();
  } catch (error) {
    const output = {
      ok: false,
      error: {
        code: 'INVALID_ARGUMENTS',
        message: error instanceof Error ? error.message : 'Invalid arguments',
      },
    };
    (process.argv.includes('--json') ? process.stdout : process.stderr).write(
      JSON.stringify(output) + '\n',
    );
    process.exit(2);
  }
})();
const root = path.resolve(values.cwd ?? process.cwd());
const credentialFile = path.join(
  process.env.TESTRON_CONFIG_HOME ?? path.join(homedir(), '.config', 'testron'),
  'credentials.json',
);
const emit = (value: unknown) =>
  process.stdout.write(
    JSON.stringify(values.json ? { ok: true, data: value } : value, null, 2) + '\n',
  );
const readCredentials = async (): Promise<Record<string, string>> =>
  JSON.parse((await readOptional(credentialFile)) ?? '{}');
async function saveCredential(server: string, token: string, projectId?: string) {
  const credentials = await readCredentials();
  credentials[`${server.replace(/\/$/, '')}${projectId ? `#${projectId}` : ''}`] = token;
  await jsonWrite(credentialFile, credentials);
}
async function tokenFor(server: string, projectId?: string, sessionOnly = false) {
  const credentials = await readCredentials();
  const origin = server.replace(/\/$/, '');
  const token =
    (!sessionOnly && process.env.TESTRON_API_KEY) ||
    (!sessionOnly && projectId && credentials[`${origin}#${projectId}`]) ||
    credentials[origin];
  if (!token) throw new CliError('AUTH_REQUIRED', 'Run testron login or set TESTRON_API_KEY.');
  return token;
}
async function password() {
  if (values['password-stdin']) {
    let data = '';
    for await (const chunk of process.stdin) data += chunk;
    return data.replace(/\r?\n$/, '');
  }
  if (!process.stdin.isTTY)
    throw new CliError('PASSWORD_REQUIRED', 'Noninteractive login requires --password-stdin.');
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) process.stderr.write(chunk);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  const answer = rl.question('Password: ');
  muted = true;
  try {
    return await answer;
  } finally {
    rl.close();
    process.stderr.write('\n');
  }
}
async function main() {
  if (values.version) {
    process.stdout.write('0.1.0\n');
    return;
  }
  if (values.help || !positionals.length) {
    process.stdout.write(help);
    return;
  }
  const [command, subcommand] = positionals;
  const allowed: Record<string, string[]> = {
    init: ['server', 'project', 'repository', 'environment', 'agent'],
    login: ['server', 'email', 'password-stdin'],
    key: subcommand === 'create' ? ['name', 'days'] : ['id'],
    pull: ['tests', 'test', 'suite'],
    push: ['file', 'dry-run'],
    docs: ['agent'],
  };
  if (!allowed[command])
    throw new CliError('UNKNOWN_COMMAND', `Unknown command ${command}. Run testron --help.`);
  if (positionals.length > (command === 'key' ? 2 : 1))
    throw new CliError(
      'INVALID_ARGUMENTS',
      'Unexpected positional argument. Use -f to select a spec file.',
    );
  for (const flag of Object.keys(values))
    if (!['cwd', 'json', 'help', 'version', ...allowed[command]].includes(flag))
      throw new CliError('INVALID_ARGUMENTS', `--${flag} is not supported by ${command}.`);
  if (command === 'docs') {
    process.stdout.write(
      await readFile(new URL(values.agent ? './AGENT.md' : './CLI.md', import.meta.url), 'utf8'),
    );
    return;
  }
  if (command === 'init') {
    const configFile = await sourcePath(root, 'testron.config.ts', true);
    if ((await readOptional(configFile)) !== undefined)
      throw new CliError(
        'CONFIG_EXISTS',
        'testron.config.ts already exists. Edit it to change configuration.',
      );
    const config = configSchema.parse({
      server: values.server ?? 'https://app.testron.dev',
      projectId: values.project,
      repositoryId: values.repository ?? randomUUID(),
      environmentIds: values.environment ?? [],
    });
    const generatedFile = await sourcePath(root, 'testron.generated.ts', true);
    if ((await readOptional(generatedFile)) !== undefined)
      throw new CliError(
        'GENERATED_EXISTS',
        'testron.generated.ts already exists. Preserve it before initializing.',
      );
    await atomicWrite(configFile, `export default ${JSON.stringify(config, null, 2)};\n`);
    await atomicWrite(
      await sourcePath(root, 'testron.generated.ts', true),
      generateReferences({ suites: [] }),
    );
    const gitignore = await sourcePath(root, '.gitignore', true);
    const previous = (await readOptional(gitignore)) ?? '';
    const ignored = ['.testron/state.json', '.testron/catalog.json', '.testron/requests.json'];
    await atomicWrite(
      gitignore,
      `${previous}${previous.endsWith('\n') || !previous ? '' : '\n'}${ignored.filter((line) => !previous.split('\n').includes(line)).join('\n')}\n`,
    );
    if (values.agent) {
      const dir = path.join(root, '.testron');
      await mkdir(dir, { recursive: true });
      if ((await lstat(dir)).isSymbolicLink())
        throw new CliError('UNSAFE_PATH', '.testron cannot be a symlink.');
      await atomicWrite(
        path.join(dir, 'AGENT.md'),
        await readFile(new URL('./AGENT.md', import.meta.url), 'utf8'),
      );
      const agents = await sourcePath(root, 'AGENTS.md', true);
      const previous = (await readOptional(agents)) ?? '';
      const instruction =
        'For Testron test integration, read .testron/AGENT.md (regenerate with `testron docs --agent`).';
      if (!previous.includes(instruction))
        await atomicWrite(agents, `${previous}\n${instruction}\n`);
    }
    emit({
      config: configFile,
      repositoryId: config.repositoryId,
      next: 'Run testron login, then testron pull. Commit config and generated references.',
    });
    return;
  }
  if (command === 'login') {
    const server =
      values.server ??
      ((await readOptional(path.join(root, 'testron.config.ts')))
        ? (await loadConfig(root)).server
        : 'https://app.testron.dev');
    // Validate the destination before sending a password.
    configSchema.shape.server.parse(server);
    if (!values.email) throw new CliError('EMAIL_REQUIRED', 'Provide --email.');
    const session = await apiClient(server).auth.login.mutate({
      email: values.email,
      password: await password(),
    });
    await saveCredential(server, session.accessToken);
    emit({ server, expiresAt: session.expiresAt, credentials: credentialFile });
    return;
  }
  const config = await loadConfig(root);
  if (command === 'key') {
    const api = apiClient(config.server, await tokenFor(config.server, undefined, true));
    if (subcommand === 'create') {
      const key = await api.sync.createKey.mutate({
        projectId: config.projectId,
        name: values.name ?? 'Developer CLI',
        days: values.days ? Number(values.days) : 90,
      });
      await saveCredential(config.server, key.token, config.projectId);
      emit({
        id: key.id,
        expiresAt: key.expiresAt,
        credentials: credentialFile,
        message: 'Project API key saved. Subsequent pushes and pulls use this key.',
      });
    } else if (subcommand === 'revoke') {
      emit(
        await api.sync.revokeKey.mutate({
          projectId: config.projectId,
          id: z.uuid().parse(values.id),
        }),
      );
    } else
      throw new CliError(
        'UNKNOWN_COMMAND',
        'Use testron key create or testron key revoke --id <uuid>.',
      );
    return;
  }
  const api = apiClient(config.server, await tokenFor(config.server, config.projectId));
  if (command === 'pull')
    emit(
      await pull(root, config, api, {
        tests: values.tests,
        test: values.test,
        suite: values.suite,
      }),
    );
  else if (command === 'push')
    emit(await push(root, config, api, { file: values.file, dryRun: values['dry-run'] }));
  else throw new CliError('UNKNOWN_COMMAND', `Unknown command ${command}. Run testron --help.`);
}
void main().catch((error: unknown) => {
  let code =
    error instanceof CliError
      ? error.code
      : error instanceof TRPCClientError
        ? (error.data?.code ?? 'API_ERROR')
        : error instanceof z.ZodError
          ? 'VALIDATION_ERROR'
          : 'CLI_ERROR';
  const message = error instanceof Error ? error.message : 'Unknown error';
  const prefix = /^([A-Z_]+): /.exec(message)?.[1];
  if (prefix) code = prefix;
  const result = {
    ok: false,
    error: {
      code,
      message,
      ...(error instanceof CliError && error.details ? { details: error.details } : {}),
    },
  };
  (values.json ? process.stdout : process.stderr).write(JSON.stringify(result, null, 2) + '\n');
  process.exitCode =
    error instanceof CliError || error instanceof z.ZodError || code.includes('CONFLICT') ? 2 : 1;
});
