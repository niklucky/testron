import type { ReactNode } from 'react';

import { Icon, IconButton, SectionLabel, type IconName } from '../../ui/design';

/**
 * The board's furniture: a lane, a card, and the two kinds of arrow between
 * them. The test reads left to right — what it is, what it needs, what it
 * does, what it proves, how it went — so the arrows are part of the argument,
 * not decoration.
 */

export const Lane = ({
  icon,
  title,
  count,
  hint,
  onAdd,
  addLabel,
  action,
  contentTestId,
  children,
  width = 300,
}: {
  icon: IconName;
  title: string;
  count?: number;
  /** One line under the title when the column needs explaining. */
  hint?: string;
  onAdd?: () => void;
  addLabel?: string;
  action?: ReactNode;
  contentTestId?: string;
  children: ReactNode;
  width?: number;
}) => (
  <section className="flex min-h-0 flex-col" style={{ width }}>
    <header className="flex h-8 shrink-0 items-center gap-2">
      <Icon name={icon} size={13} className="text-ink-3" />
      <SectionLabel>{title}</SectionLabel>
      {count !== undefined && <span className="ui-mono text-ink-3">{count}</span>}
      {action && <div className="ml-auto">{action}</div>}
      {onAdd && (
        <IconButton
          icon="plus"
          size="sm"
          label={addLabel ?? `Add to ${title.toLowerCase()}`}
          className={action ? '' : 'ml-auto'}
          onClick={onAdd}
        />
      )}
    </header>
    {hint && <p className="mb-2 mt-0.5 leading-4 text-ink-3">{hint}</p>}
    <div
      data-testid={contentTestId}
      className="ui-scroll min-h-0 flex-1 space-y-2 overflow-y-auto pb-4 pr-1"
    >
      {children}
    </div>
  </section>
);

/** The gutter between two lanes. */
export const Flow = () => (
  <div className="flex w-9 shrink-0 items-start justify-center pt-[52px]" aria-hidden>
    <span className="flex items-center text-ink-3">
      <span className="h-px w-3 bg-line" />
      <Icon name="chevron" size={14} />
    </span>
  </div>
);

/** The link between two cards inside a lane. */
export const Step = () => (
  <div className="flex justify-center py-0.5" aria-hidden>
    <Icon name="caret" size={13} className="text-ink-3" />
  </div>
);

/**
 * The elbow from a step down into something that hangs off it.
 *
 * An assertion belongs to the action it follows, so it is drawn as a child of
 * that card rather than a neighbour in another column: one rule down the left,
 * a right angle, an arrow. Nesting keeps the two in step without anything
 * having to measure and match row heights across lanes.
 */
export const Branch = ({ last, children }: { last: boolean; children: ReactNode }) => (
  <div className="relative pl-6 pt-1.5">
    <span
      aria-hidden
      className="absolute left-2.5 top-0 w-px bg-line"
      style={{ height: last ? 20 : '100%' }}
    />
    <span aria-hidden className="absolute left-2.5 top-5 flex items-center text-ink-3">
      <span className="h-px w-2.5 bg-line" />
      <Icon name="chevron" size={11} />
    </span>
    {children}
  </div>
);

export const Card = ({
  selected = false,
  tone,
  onClick,
  className = '',
  children,
}: {
  selected?: boolean;
  /** A border colour that means something — a failing step, a running card. */
  tone?: string;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}) => (
  <div
    className={`rounded-lg border bg-surface p-2.5 transition-colors ${
      selected ? 'border-accent' : 'border-line hover:border-line-soft'
    } ${onClick ? 'cursor-default' : ''} ${className}`}
    style={tone && !selected ? { borderColor: tone } : undefined}
    onClick={onClick}
  >
    {children}
  </div>
);

/** The row of quiet metadata at the bottom of a card. */
export const Meta = ({ children }: { children: ReactNode }) => (
  <p className="mt-1.5 flex items-center gap-1.5 text-ink-3">{children}</p>
);

export const EmptyLane = ({ children }: { children: ReactNode }) => (
  <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center leading-5 text-ink-3">
    {children}
  </p>
);
