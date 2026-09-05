import { useRef, type ReactNode, type UIEvent } from 'react';

const tokenPattern = new RegExp(
  [
    '(//[^\\n]*)',
    '(/\\*[\\s\\S]*?\\*/)',
    '(\'(?:\\\\.|[^\'\\\\])*\'|"(?:\\\\.|[^"\\\\])*"|`(?:\\\\.|[^`\\\\])*`)',
    '\\b(import|export|from|as|test|expect|await|async|const|let|var|if|else|for|while|return|throw|new|typeof|instanceof|true|false|null|undefined)\\b',
    '([A-Za-z_$][\\w$]*)(?=\\s*\\()',
    '\\b([A-Z][A-Z0-9_]{2,})\\b',
    '\\b(\\d+(?:\\.\\d+)?)\\b',
  ].join('|'),
  'g',
);

const tokenStyles = [
  { className: 'italic', color: 'var(--ui-ink-3)' },
  { className: 'italic', color: 'var(--ui-ink-3)' },
  { className: '', color: 'var(--ui-good)' },
  { className: '', color: 'var(--ui-accent)' },
  { className: '', color: 'var(--ui-serious)' },
  { className: '', color: 'var(--ui-warning-ink)' },
  { className: '', color: 'var(--ui-warning-ink)' },
];

const highlight = (source: string): ReactNode => {
  // Malformed, large drafts can make the regex scanner quadratic. Keep their
  // text editable without synchronously tokenizing the whole document.
  if (source.length > 20_000) return source;
  const output: ReactNode[] = [];
  let last = 0;
  let key = 0;
  tokenPattern.lastIndex = 0;
  for (let match = tokenPattern.exec(source); match; match = tokenPattern.exec(source)) {
    if (match.index > last) output.push(source.slice(last, match.index));
    const group = match.slice(1).findIndex((value) => value !== undefined);
    const style = tokenStyles[group]!;
    output.push(
      <span key={key++} className={style.className} style={{ color: style.color }}>
        {match[0]}
      </span>,
    );
    last = match.index + match[0].length;
  }
  if (last < source.length) output.push(source.slice(last));
  return output;
};

export const SourceEditor = ({
  value,
  onChange,
  onFocusChange,
  ariaLabel,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  onFocusChange?: (focused: boolean) => void;
  ariaLabel: string;
  className?: string;
}) => {
  const highlightedRef = useRef<HTMLPreElement>(null);
  const synchronizeScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    if (!highlightedRef.current) return;
    highlightedRef.current.style.transform = `translate(${-event.currentTarget.scrollLeft}px, ${-event.currentTarget.scrollTop}px)`;
  };

  return (
    <div className={`relative min-h-0 overflow-hidden bg-plane ${className}`}>
      <pre
        ref={highlightedRef}
        aria-hidden
        className="ui-mono pointer-events-none absolute top-0 left-0 min-h-full min-w-full whitespace-pre p-3 leading-[19px] text-ink-2"
        style={{ tabSize: 2 }}
      >
        {highlight(value)}
        {'\n'}
      </pre>
      <textarea
        aria-label={ariaLabel}
        value={value}
        wrap="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => onFocusChange?.(false)}
        onScroll={synchronizeScroll}
        className="ui-mono absolute inset-0 h-full w-full resize-none overflow-auto bg-transparent p-3 leading-[19px] outline-none selection:bg-accent/30"
        style={{ color: 'transparent', caretColor: 'var(--ui-ink)', tabSize: 2 }}
      />
    </div>
  );
};
