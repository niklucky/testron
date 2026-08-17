import { useRef, type ReactNode } from 'react';

import { IconButton } from '../design';

export const MIN_WIDTH = 18;
export const MAX_WIDTH = 46;

export type ResizePhase = 'start' | 'move' | 'end';

/**
 * An opaque panel docked beside the recorded page. The site is resized into
 * the remaining centre space, so forms and text are never hidden underneath.
 * The frame is host-agnostic: inline in the browser study and a dedicated
 * WebContentsView in Electron.
 */
export const GlassPanel = ({
  side,
  title,
  subtitle,
  width,
  onResize,
  onClose,
  action,
  children,
}: {
  side: 'left' | 'right';
  title: string;
  subtitle?: string;
  /** Percentage of the containing box. */
  width: number;
  /** Reports a percentage of the window, clamped, at each phase of the drag. */
  onResize: (width: number, phase: ResizePhase) => void;
  onClose: () => void;
  action?: ReactNode;
  children: ReactNode;
}) => {
  const dragging = useRef(false);

  const report = (clientX: number, phase: ResizePhase) => {
    const fraction = (side === 'left' ? clientX : window.innerWidth - clientX) / window.innerWidth;
    onResize(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(fraction * 100))), phase);
  };

  return (
    <aside
      className={`absolute inset-y-0 z-20 flex flex-col border-line bg-surface shadow-xl ${
        side === 'left' ? 'left-0 border-r' : 'right-0 border-l'
      }`}
      style={{ width: `${width}%` }}
      aria-label={title}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <h2 className="text-md font-semibold">{title}</h2>
        {subtitle && <span className="ui-mono truncate text-xs text-ink-3">{subtitle}</span>}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {action}
          <IconButton
            icon="close"
            size="sm"
            label={`Hide ${title.toLowerCase()}`}
            onClick={onClose}
          />
        </div>
      </header>

      <div className="ui-scroll min-h-0 flex-1 overflow-y-auto">{children}</div>

      {/* The resize edge. Wide enough to grab, invisible until you are on it.
          Pointer capture keeps the drag alive after the cursor leaves the
          panel — which, in the packaged app, means leaving the view. */}
      <div
        role="separator"
        aria-label={`Resize ${title.toLowerCase()}`}
        aria-orientation="vertical"
        className={`absolute inset-y-0 w-1.5 cursor-col-resize hover:bg-accent/40 ${
          side === 'left' ? '-right-[3px]' : '-left-[3px]'
        }`}
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          report(event.clientX, 'start');
        }}
        onPointerMove={(event) => {
          if (dragging.current) report(event.clientX, 'move');
        }}
        onPointerUp={(event) => {
          if (!dragging.current) return;
          dragging.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
          report(event.clientX, 'end');
        }}
      />
    </aside>
  );
};
