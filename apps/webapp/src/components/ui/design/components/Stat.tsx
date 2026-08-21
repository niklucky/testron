import type { ReactNode } from 'react';

import { Icon, type IconName } from '../icons';
import { toneFill, toneStyle, type Tone } from '../tone';
import { Panel } from './Panel';

/**
 * One number, said once. The label names it, the value is the only thing set
 * large, and the foot line carries the breakdown that would otherwise turn
 * into four more tiles.
 */
export const StatCard = ({
  icon,
  label,
  value,
  delta,
  foot,
  className = '',
}: {
  icon: IconName;
  label: string;
  value: ReactNode;
  /** A <Trend> or <Badge> sitting on the value's baseline. */
  delta?: ReactNode;
  foot?: ReactNode;
  className?: string;
}) => (
  <Panel className={`p-4 ${className}`}>
    <p className="flex items-center gap-2 text-ink-3">
      <Icon name={icon} size={14} />
      {label}
    </p>
    <p className="mt-2 flex items-baseline gap-2">
      <strong className="font-semibold tabular-nums">{value}</strong>
      {delta}
    </p>
    {foot && <p className="mt-2 text-ink-3">{foot}</p>}
  </Panel>
);

/**
 * A signed delta. Direction is carried by the arrow first and the tone second;
 * `goodDown` flips which direction counts as an improvement (durations,
 * failure counts) without flipping the arrow, which always follows the number.
 */
export const Trend = ({
  value,
  unit = '',
  digits = 1,
  goodDown = false,
}: {
  value: number;
  unit?: string;
  digits?: number;
  goodDown?: boolean;
}) => {
  const up = value >= 0;
  const tone: Tone = up === !goodDown ? 'good' : 'critical';
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-px font-semibold tabular-nums"
      style={toneStyle(tone)}
    >
      <Icon name={up ? 'arrowUp' : 'arrowDown'} size={10} />
      {Math.abs(value).toFixed(digits)}
      {unit}
    </span>
  );
};

/** A single-value progress track. For a multi-part bar use SplitBar. */
export const Meter = ({
  value,
  tone = 'accent',
  color,
  height = 6,
  label,
  className = '',
}: {
  /** 0–1. Clamped, so a caller can hand it a raw ratio. */
  value: number;
  tone?: Tone;
  /** Escape hatch for a chart colour that is not a status tone. */
  color?: string;
  height?: number;
  label?: string;
  className?: string;
}) => (
  <span
    className={`block overflow-hidden rounded-full bg-line-soft ${className}`}
    style={{ height }}
    role="img"
    aria-label={label}
    title={label}
  >
    <span
      className="block h-full rounded-full"
      style={{
        width: `${Math.max(0, Math.min(1, value)) * 100}%`,
        background: color ?? toneFill[tone],
      }}
    />
  </span>
);
