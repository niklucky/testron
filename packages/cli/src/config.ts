import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { z } from 'zod';
import { sourcePathSchema } from '@testron/protocol';
import { CliError } from './files';

export const configSchema = z
  .object({
    server: z.url().refine((value) => {
      const url = new URL(value);
      return (
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        (url.protocol === 'https:' ||
          (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
      );
    }, 'Use HTTPS, or HTTP on localhost.'),
    projectId: z.uuid(),
    repositoryId: z.uuid(),
    playwrightConfig: sourcePathSchema.default('playwright.config.ts'),
    environmentIds: z.array(z.uuid()).default([]),
    supportFiles: z.array(sourcePathSchema).default([]),
    importDir: sourcePathSchema.optional(),
    reportEnvironmentId: z.uuid().optional(),
  })
  .strict();
export type Config = z.infer<typeof configSchema>;
export async function loadConfig(root: string): Promise<Config> {
  const dir = await mkdtemp(path.join(tmpdir(), 'testron-config-'));
  try {
    const outfile = path.join(dir, 'config.mjs');
    await build({
      entryPoints: [path.join(root, 'testron.config.ts')],
      outfile,
      bundle: true,
      platform: 'node',
      format: 'esm',
      logLevel: 'silent',
    });
    return configSchema.parse((await import(pathToFileURL(outfile).href)).default);
  } catch (error) {
    throw new CliError(
      'CONFIG_INVALID',
      `Cannot load testron.config.ts. Run testron init or fix the configuration. ${error instanceof Error ? error.message : ''}`,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
