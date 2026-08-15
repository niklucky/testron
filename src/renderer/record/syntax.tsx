import type { ReactNode } from 'react';

/**
 * Enough TypeScript highlighting for generated Playwright, and no more.
 *
 * The panel shows one kind of file — a spec we wrote ourselves — so a six-rule
 * tokenizer covers it. Anything it fails to classify stays secondary ink,
 * which is the right default: unhighlighted code still reads.
 */
const pattern = new RegExp(
  [
    '(//[^\\n]*)', // comment
    "('(?:\\\\.|[^'\\\\])*')", // string
    '\\b(import|from|test|expect|await|async|const|process|new|true|false|null)\\b', // keyword
    '([A-Za-z_$][\\w$]*)(?=\\s*\\()', // call
    '\\b([A-Z][A-Z0-9_]{2,})\\b', // SCREAMING_CASE — env vars
    '\\b(\\d+(?:\\.\\d+)?)\\b', // number
  ].join('|'),
  'g',
);

const styles = [
  { className: 'italic', color: 'var(--ui-ink-3)' }, // comment
  { className: '', color: 'var(--ui-good)' }, // string
  { className: '', color: 'var(--ui-accent)' }, // keyword
  { className: '', color: 'var(--ui-serious)' }, // call
  { className: '', color: 'var(--ui-warning-ink)' }, // env var
  { className: '', color: 'var(--ui-warning-ink)' }, // number
];

export const highlight = (line: string): ReactNode => {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;

  pattern.lastIndex = 0;
  for (let match = pattern.exec(line); match; match = pattern.exec(line)) {
    if (match.index > last) out.push(line.slice(last, match.index));
    const group = match.slice(1).findIndex((value) => value !== undefined);
    const style = styles[group];
    out.push(
      <span key={key++} className={style.className} style={{ color: style.color }}>
        {match[0]}
      </span>,
    );
    last = match.index + match[0].length;
  }

  if (last < line.length) out.push(line.slice(last));
  return out;
};
