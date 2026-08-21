import { useEffect, useRef } from 'react';

import type { CodeLine } from './codegen';
import { highlight } from './syntax';

/**
 * The generated spec, regenerated from the step list on every change — this
 * view is never the source of truth, so it is read-only until the test view
 * takes over. Lines carry the id of the step that produced them, which is
 * what lets a selection in either panel light up the other.
 */
export const CodePanel = ({
  lines,
  selectedId,
  onSelectStep,
}: {
  lines: CodeLine[];
  selectedId?: string;
  onSelectStep: (id: string) => void;
}) => {
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, lines.length]);

  let first = true;
  return (
    <pre className="ui-mono min-w-0 py-2 text-base leading-[19px]">
      {lines.map((line, index) => {
        const on = line.stepId !== undefined && line.stepId === selectedId;
        const anchor = on && first;
        if (anchor) first = false;
        return (
          <div
            key={index}
            ref={anchor ? activeRef : undefined}
            onClick={() => line.stepId && onSelectStep(line.stepId)}
            className={`flex gap-3 px-3 ${on ? 'bg-accent-wash' : ''} ${
              line.stepId ? 'cursor-default hover:bg-raised/60' : ''
            }`}
          >
            <span className="w-5 shrink-0 select-none text-right text-xs leading-[19px] text-ink-3">
              {index + 1}
            </span>
            <code className="min-w-0 whitespace-pre-wrap break-words text-ink-2">
              {highlight(line.text)}
            </code>
          </div>
        );
      })}
    </pre>
  );
};
