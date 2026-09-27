import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { Markdown } from '../../src/components/Docs';

it('renders guide links and third-level headings while preserving code and escaped text', () => {
  const html = renderToStaticMarkup(
    createElement(Markdown, {
      source:
        '### Report `CI` results\n\nRead the [Playwright guide](https://testron.dev/docs/playwright) and `<script>`.\n\n```ts\nconst link = "[literal](https://example.test)";\n```',
    }),
  );
  expect(html).toContain('<h3>Report <code>CI</code> results</h3>');
  expect(html).toContain('<a href="https://testron.dev/docs/playwright">Playwright guide</a>');
  expect(html).toContain('<code>&lt;script&gt;</code>');
  expect(html).toContain('[literal](https://example.test)');
  expect(html.match(/<a /g)).toHaveLength(1);
});
