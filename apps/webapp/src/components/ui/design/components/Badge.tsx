import { useTranslation } from '@warpunit/slang-react';
import type { ReactNode } from 'react';

import { Icon, type IconName } from '../icons';
import { toneFill, toneStyle, type Tone } from '../tone';

/**
 * A tinted pill for a count or a state. Tone carries the meaning, but the
 * label always spells it out — no badge is readable by colour alone.
 */
export const Badge = ({
  tone,
  icon,
  size = 'md',
  uppercase = false,
  mono = false,
  className = '',
  children,
}: {
  /** Omit for a plain neutral chip on the line colour. */
  tone?: Tone;
  icon?: IconName;
  size?: 'sm' | 'md';
  uppercase?: boolean;
  mono?: boolean;
  className?: string;
  children: ReactNode;
}) => (
  <span
    className={`inline-flex shrink-0 items-center gap-1 text-sm rounded-full font-semibold ${
      size === 'sm' ? 'px-1.5 ' : 'px-1.5 py-px '
    } ${uppercase ? 'uppercase tracking-wide' : ''} ${mono ? 'ui-mono' : ''} ${
      tone ? '' : 'bg-line-soft text-ink-3'
    } ${className}`}
    style={tone ? toneStyle(tone) : undefined}
  >
    {icon && <Icon name={icon} size={size === 'sm' ? 10 : 11} />}
    {children}
  </span>
);

/**
 * The smallest status mark there is. It must always be accompanied by text —
 * either the row it sits in, or `label`, which becomes its tooltip.
 */
export const StatusDot = ({
  tone,
  label,
  size = 7,
  className = '',
}: {
  tone: Tone;
  label: string;
  size?: number;
  className?: string;
}) => {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-block shrink-0 rounded-full ${className}`}
      style={{ width: size, height: size, background: toneFill[tone] }}
      title={t(label)}
      role="img"
      aria-label={t(label)}
    />
  );
};

/** A dot with a soft halo — for "something is happening right now". */
export const PulseDot = ({ tone = 'good' as Tone, label }: { tone?: Tone; label: string }) => {
  const { t } = useTranslation();
  return (
    <span className="relative flex h-[7px] w-[7px] shrink-0" title={t(label)}>
      <span
        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
        style={{ background: toneFill[tone] }}
      />
      <span
        className="relative inline-flex h-[7px] w-[7px] rounded-full"
        style={{ background: toneFill[tone] }}
      />
    </span>
  );
};
