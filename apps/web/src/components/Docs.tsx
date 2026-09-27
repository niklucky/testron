import type { ReactNode } from 'react';
import overview from '../../../../docs/integration/index.md?raw';
import quickstart from '../../../../docs/integration/quickstart.md?raw';
import playwright from '../../../../docs/integration/playwright.md?raw';
import sync from '../../../../docs/integration/sync.md?raw';
import cli from '../../../../docs/integration/cli.md?raw';
import agents from '../../../../docs/integration/agents.md?raw';

const pages = {
  index: ['Overview', overview],
  quickstart: ['Quickstart', quickstart],
  playwright: ['Playwright', playwright],
  sync: ['Push and pull', sync],
  cli: ['CLI reference', cli],
  agents: ['Agent guide', agents],
} as const;
function inline(text: string): ReactNode[] {
  return text
    .split(/(`[^`]+`)/)
    .map((part, index) =>
      part.startsWith('`') ? <code key={index}>{part.slice(1, -1)}</code> : part,
    );
}
// Deliberately small renderer for our authored Markdown: text is escaped by React.
function Markdown({ source }: { source: string }) {
  const blocks = source.split(/(```[\s\S]*?```)/g);
  return (
    <>
      {blocks.flatMap((block, index) => {
        if (block.startsWith('```'))
          return (
            <pre key={index}>
              <code>
                {block
                  .replace(/^```[^\n]*\n/, '')
                  .replace(/```$/, '')
                  .trimEnd()}
              </code>
            </pre>
          );
        return block
          .trim()
          .split(/\n\s*\n/)
          .filter(Boolean)
          .map((paragraph, part) => {
            const key = `${index}-${part}`;
            if (paragraph.startsWith('# ')) return <h1 key={key}>{paragraph.slice(2)}</h1>;
            if (paragraph.startsWith('## ')) return <h2 key={key}>{paragraph.slice(3)}</h2>;
            if (paragraph.startsWith('- '))
              return (
                <ul key={key}>
                  {paragraph.split(/\n(?=- )/).map((line, row) => (
                    <li key={row}>{inline(line.replace(/^- /, '').replaceAll('\n', ' '))}</li>
                  ))}
                </ul>
              );
            if (/^\d+\. /.test(paragraph))
              return (
                <ol key={key}>
                  {paragraph.split(/\n(?=\d+\. )/).map((line, row) => (
                    <li key={row}>{inline(line.replace(/^\d+\. /, '').replaceAll('\n', ' '))}</li>
                  ))}
                </ol>
              );
            return <p key={key}>{inline(paragraph.replaceAll('\n', ' '))}</p>;
          });
      })}
    </>
  );
}
export function Docs() {
  const slug = window.location.pathname.replace(/^\/docs\/?/, '').replace(/\/$/, '') || 'index';
  const page = pages[slug as keyof typeof pages];
  return (
    <div className="docs-shell">
      <header>
        <a href="/">Testron</a>
        <span>Documentation</span>
        <a href="https://app.testron.dev">Open app ↗</a>
      </header>
      <div className="docs-layout">
        <nav aria-label="Documentation">
          {Object.entries(pages).map(([key, [label]]) => (
            <a
              key={key}
              aria-current={slug === key ? 'page' : undefined}
              href={key === 'index' ? '/docs/' : `/docs/${key}`}
            >
              {label}
            </a>
          ))}
        </nav>
        <main className="docs-content">
          {page ? (
            <>
              <Markdown source={page[1]} />
              <a className="docs-markdown" href={`/docs/${slug}.md`}>
                Read as Markdown ↓
              </a>
            </>
          ) : (
            <>
              <h1>Page not found</h1>
              <a href="/docs/">Documentation home</a>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
