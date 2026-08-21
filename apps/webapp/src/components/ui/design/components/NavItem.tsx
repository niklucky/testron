import type { ReactNode } from 'react';

import { Icon, type IconName } from '../icons';
import { toneStyle, type Tone } from '../tone';

/**
 * A row in the left rail. The active row is marked by a wash plus weight —
 * never by colour alone — so it survives a squint and a colour-blind viewer.
 */
export const NavItem = ({
  icon,
  label,
  active = false,
  badge,
  badgeTone = 'critical',
  onClick,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  badge?: ReactNode;
  badgeTone?: Tone;
  onClick?: () => void;
}) => (
  <button
    type="button"
    aria-current={active ? 'page' : undefined}
    className={`flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left transition-colors ${
      active ? 'bg-accent-wash font-medium text-ink' : 'text-ink-2 hover:bg-raised hover:text-ink'
    }`}
    onClick={onClick}
  >
    <Icon name={icon} size={16} className={active ? 'text-accent' : ''} />
    {label}
    {badge !== undefined && (
      <span
        className="ui-mono ml-auto rounded-full px-1.5 font-semibold"
        style={toneStyle(badgeTone)}
      >
        {badge}
      </span>
    )}
  </button>
);

/** Initials chip. The app is local-first, so there are no avatar images. */
export const Avatar = ({
  initials,
  size = 32,
  className = '',
}: {
  initials: string;
  size?: number;
  className?: string;
}) => (
  <span
    className={`grid shrink-0 place-items-center rounded-full bg-raised font-semibold text-ink-2 ${className}`}
    style={{ width: size, height: size, fontSize: size <= 24 ? 10 : 12 }}
  >
    {initials}
  </span>
);
