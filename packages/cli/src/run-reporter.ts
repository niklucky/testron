import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { loadConfig } from './config';
import { apiClient } from './sync';
import { hash, readOptional } from './files';

export default class TestronReporter implements Reporter {
  private pending: Promise<void>[] = [];
  private errors: string[] = [];
  constructor(private options: { cwd?: string; environmentId?: string } = {}) {}
  private setup = async () => {
    const root = path.resolve(this.options.cwd ?? process.cwd());
    const config = await loadConfig(root);
    const environmentId =
      this.options.environmentId ??
      process.env.TESTRON_REPORT_ENVIRONMENT_ID ??
      config.reportEnvironmentId;
    if (!environmentId)
      throw new Error(
        'Set reportEnvironmentId or TESTRON_REPORT_ENVIRONMENT_ID to the CI/local reporting environment. This does not grant remote execution permission.',
      );
    const credentials = JSON.parse(
      (await readOptional(
        path.join(
          process.env.TESTRON_CONFIG_HOME ?? path.join(homedir(), '.config/testron'),
          'credentials.json',
        ),
      )) ?? '{}',
    );
    const server = config.server.replace(/\/$/, '');
    const token =
      process.env.TESTRON_API_KEY ??
      credentials[`${server}#${config.projectId}`] ??
      credentials[server];
    if (!token) throw new Error('Set TESTRON_API_KEY or run testron login before reporting.');
    const state = JSON.parse(await readFile(path.join(root, '.testron/state.json'), 'utf8'));
    if (state.binding !== JSON.stringify([config.server, config.projectId, config.repositoryId]))
      throw new Error('Sync state belongs to another project.');
    return { root, config, environmentId, state, api: apiClient(config.server, token) };
  };
  private ready?: ReturnType<TestronReporter['setup']>;
  onTestEnd(test: TestCase, result: TestResult) {
    const id = test.annotations.find((item) => item.type === 'testron.id')?.description;
    if (!id) return;
    this.pending.push(
      (async () => {
        const { config, environmentId, state, api } = await (this.ready ??= this.setup());
        const revision = state.tests[id];
        if (!revision) throw new Error(`Pull or push test ${id} before reporting its results.`);
        await api.sync.report.mutate({
          id: randomUUID(),
          projectId: config.projectId,
          testId: id,
          testRevision: revision,
          environmentId,
          source: process.env.CI === 'true' ? 'ci' : 'repository-local',
          status:
            result.status === 'skipped' || result.status === 'interrupted'
              ? 'cancelled'
              : result.status,
          startedAt: result.startTime.toISOString(),
          durationMs: Math.round(result.duration),
          error:
            result.errors
              .map((error) => error.message ?? '')
              .join('\n')
              .slice(0, 10000) || null,
          context: {
            sourceHash: hash(await readFile(test.location.file, 'utf8')),
            playwrightProject: test.parent.project()?.name ?? '',
            retry: result.retry,
          },
        });
      })().catch((error) => {
        this.errors.push(error instanceof Error ? error.message : String(error));
      }),
    );
  }
  async onEnd() {
    await Promise.all(this.pending);
    if (this.errors.length) {
      process.stderr.write(`Testron reporting failed:\n${[...new Set(this.errors)].join('\n')}\n`);
      return { status: 'failed' as const };
    }
  }
}
