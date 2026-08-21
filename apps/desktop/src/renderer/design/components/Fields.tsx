import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';

import { Icon } from '../icons';

/**
 * A filter box. It is a `<label>` wrapping the input, so the whole chrome is a
 * click target and the accessible name comes from `label` rather than a
 * placeholder — placeholders vanish exactly when you need them.
 */
export const SearchField = forwardRef<
  HTMLInputElement,
  {
    label: string;
    size?: 'sm' | 'md';
    mono?: boolean;
    /** Rendered at the trailing edge — usually a <Kbd>. */
    hint?: ReactNode;
    className?: string;
  } & Omit<ComponentPropsWithoutRef<'input'>, 'size'>
>(({ label, size = 'md', mono = false, hint, className = '', ...rest }, ref) => (
  <label
    className={`flex items-center gap-1.5 rounded-md border border-line bg-plane ${
      size === 'sm' ? 'h-7 px-2' : 'h-8 px-2.5'
    } ${className}`}
  >
    <Icon name="search" size={size === 'sm' ? 12 : 13} className="shrink-0 text-ink-3" />
    <input
      ref={ref}
      aria-label={label}
      className={`min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3 ${
        size === 'sm' ? '' : ''
      } ${mono ? 'ui-mono' : ''}`}
      {...rest}
    />
    {hint}
  </label>
));

SearchField.displayName = 'SearchField';

/** A free-text note. Grows nothing on its own — set the height where it is used. */
export const TextArea = ({
  label,
  className = '',
  ...rest
}: { label: string } & ComponentPropsWithoutRef<'textarea'>) => (
  <label className="block">
    <span className="text-ink-3">{label}</span>
    <textarea
      aria-label={label}
      className={`mt-1.5 w-full resize-none rounded-lg border border-line bg-plane p-2.5 text-ink outline-none placeholder:text-ink-3 focus:border-accent ${className}`}
      {...rest}
    />
  </label>
);
