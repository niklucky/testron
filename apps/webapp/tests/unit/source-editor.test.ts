import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { SourceEditor } from '@testron/ui/source-editor';

const render = (value: string) =>
  renderToStaticMarkup(
    createElement(SourceEditor, {
      value,
      onChange: () => undefined,
      ariaLabel: 'Source',
    }),
  );

it('highlights ordinary drafts and keeps large malformed drafts as plain editable text', () => {
  expect(render('const value = 1;')).toContain('<span');
  const source = '/* '.repeat(10_000);
  const markup = render(source);
  expect(markup).not.toContain('<span');
  expect(markup).toContain(source);
  expect(markup).toContain('<textarea');
});
