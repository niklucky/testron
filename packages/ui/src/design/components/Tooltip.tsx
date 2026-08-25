import type { ReactNode } from 'react';

/**
 * A hover card for a mark too small to label — a bar, a ribbon cell, a dot.
 *
 * CSS-only on purpose: charts render hundreds of these, and a JS-positioned
 * tooltip per cell would cost more than the chart. The trade-off is that the
 * card cannot escape a clipping ancestor, so keep chart bodies unclipped.
 */
export const Tooltip = ({
  content,
  children,
  className = '',
  align = 'center',
}: {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  align?: 'center' | 'start';
}) => (
  <span className={`group relative ${className}`}>
    {children}
    <span
      role="tooltip"
      className={`pointer-events-none absolute bottom-full z-20 mb-1.5 hidden whitespace-nowrap rounded-md border border-line bg-plane px-2 py-1 text-ink-2 shadow-lg group-hover:block group-focus-within:block ${
        align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0'
      }`}
    >
      {content}
    </span>
  </span>
);
