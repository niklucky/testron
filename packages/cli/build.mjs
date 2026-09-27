import { build } from 'esbuild';
import { chmod, copyFile } from 'node:fs/promises';
await build({
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/cli.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: ['@trpc/client', 'esbuild', 'typescript', 'zod'],
  banner: { js: '#!/usr/bin/env node' },
});
await build({
  entryPoints: ['src/reporter.ts'],
  outfile: 'dist/reporter.cjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
});
await copyFile('../../docs/integration/agents.md', 'dist/AGENT.md');
await copyFile('../../docs/integration/cli.md', 'dist/CLI.md');
await chmod('dist/cli.js', 0o755);
