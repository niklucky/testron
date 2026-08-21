import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { Icon, type IconName } from '../icons';
import { toneInk, toneWash, type Tone } from '../tone';
import { Kbd } from './Kbd';

/**
 * Four weights of the same button, ordered by how loudly they ask to be
 * pressed. A screen should contain at most one `primary`.
 *
 *   primary   the single committing action ("Run all")
 *   default   an ordinary action that needs an edge to be findable
 *   soft      an action inside dense chrome — filled, but quiet
 *   ghost     a navigation-ish action in a list or rail
 */
export type ButtonVariant = 'primary' | 'default' | 'soft' | 'ghost';

const base =
  'inline-flex shrink-0 items-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors disabled:pointer-events-none';

const bySize = {
  sm: 'h-7 px-2.5 ',
  md: 'h-8 px-3 ',
  lg: 'h-9 px-3 ',
};

const byVariant: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110',
  default: 'border border-line bg-surface text-ink-2 hover:text-ink',
  soft: 'border border-line bg-raised text-ink-2 hover:text-ink',
  ghost: 'text-ink-2 hover:bg-raised hover:text-ink',
};

export const Button = ({
  variant = 'default',
  size = 'md',
  icon,
  iconEnd,
  kbd,
  pressed,
  tone,
  block,
  className = '',
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: keyof typeof bySize;
  icon?: IconName;
  iconEnd?: IconName;
  /** Shortcut hint rendered at the trailing edge; also documents the key. */
  kbd?: string;
  /** Toggle state. A pressed button picks up `tone` (accent when unset). */
  pressed?: boolean;
  tone?: Tone;
  block?: boolean;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<'button'>, 'children'>) => {
  const on = pressed === true;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={`${base} ${bySize[size]} ${byVariant[variant]} ${block ? 'w-full justify-start' : ''} ${
        on ? 'border-current' : ''
      } ${className}`}
      style={
        on
          ? { color: toneInk[tone ?? 'accent'], background: toneWash[tone ?? 'accent'] }
          : undefined
      }
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 13 : 14} />}
      {children}
      {iconEnd && <Icon name={iconEnd} size={size === 'sm' ? 13 : 14} />}
      {kbd && <Kbd className="ml-0.5 text-sm">{kbd}</Kbd>}
    </button>
  );
};

const iconSizes = {
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
};

/**
 * A bare icon action. `label` is mandatory — it becomes both the accessible
 * name and the tooltip, because an icon on its own never explains itself.
 */
export const IconButton = ({
  icon,
  label,
  size = 'md',
  active = false,
  className = '',
  ...rest
}: {
  icon: IconName;
  label: string;
  size?: keyof typeof iconSizes;
  /** Reflects a mode this button turned on, e.g. compact rows. */
  active?: boolean;
} & Omit<ComponentPropsWithoutRef<'button'>, 'children'>) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    className={`grid shrink-0 place-items-center rounded-md transition-colors hover:bg-raised ${
      iconSizes[size]
    } ${active ? 'text-accent' : 'text-ink-3 hover:text-ink'} ${className}`}
    {...rest}
  >
    <Icon name={icon} size={size === 'sm' ? 14 : 16} />
  </button>
);
