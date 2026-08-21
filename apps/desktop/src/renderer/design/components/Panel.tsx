import type { ReactNode } from 'react';

/** A bordered region on the canvas. The only container with a shadowless edge. */
export const Panel = ({
  className = '',
  children,
}: {
  className?: string;
  children: ReactNode;
}) => (
  <section className={`rounded-xl border border-line bg-surface ${className}`}>{children}</section>
);

/** Title row for a Panel: what it is, how much of it there is, what you can do. */
export const PanelHeader = ({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) => (
  <div className="flex items-start justify-between gap-4 border-b border-line-soft px-4 py-3">
    <div>
      <h2 className="text-md font-semibold">{title}</h2>
      {subtitle && <p className="mt-0.5 text-ink-3">{subtitle}</p>}
    </div>
    {action}
  </div>
);

/**
 * The uppercase micro-heading used on rails and dense sections, where a real
 * heading would out-weigh the data underneath it.
 */
export const SectionLabel = ({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) => (
  <span className={`font-semibold uppercase tracking-[0.11em] text-ink-2 ${className}`}>
    {children}
  </span>
);

/** What a list says when a filter matched nothing. */
export const EmptyState = ({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) => <p className={`px-4 py-8 text-center text-ink-3 ${className}`}>{children}</p>;
