import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/** The public site is fully static: GitHub Pages serves `dist` at testron.dev. */
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'testron-docs',
      enforce: 'post',
      generateBundle(_options, bundle) {
        const index = bundle['index.html'];
        if (!index || index.type !== 'asset') return;
        this.emitFile({
          type: 'asset',
          fileName: 'agents/SKILL.md',
          source: readFileSync(
            new URL('../../docs/agents/testron/SKILL.md', import.meta.url),
            'utf8',
          ),
        });
        for (const slug of ['index', 'quickstart', 'playwright', 'sync', 'cli', 'agents']) {
          this.emitFile({
            type: 'asset',
            fileName: slug === 'index' ? 'docs/index.html' : `docs/${slug}/index.html`,
            source: index.source,
          });
          this.emitFile({
            type: 'asset',
            fileName: `docs/${slug}.md`,
            source: readFileSync(
              new URL(`../../docs/integration/${slug}.md`, import.meta.url),
              'utf8',
            ),
          });
        }
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: 4403,
    strictPort: true,
  },
});
