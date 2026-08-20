import { useTranslation } from '@warpunit/slang-react';
export type Split = { id: string; value: number; color: string; label: string };

/**
 * One bar cut into parts — a composition, not a progress bar. Empty parts are
 * dropped rather than rendered at 0 width, so a healthy suite reads as one
 * solid green line instead of a green line with two slivers.
 */
export const SplitBar = ({
  segments,
  total,
  height = 4,
  className = '',
}: {
  segments: Split[];
  /** Defaults to the sum. Pass it when parts should not fill the track. */
  total?: number;
  height?: number;
  className?: string;
}) => {
  const { t } = useTranslation();
  const sum = total ?? segments.reduce((value, segment) => value + segment.value, 0);
  const scale = Math.max(1, sum);
  return (
    <span
      className={`flex gap-[2px] overflow-hidden rounded-full bg-line-soft ${className}`}
      style={{ height }}
      role="img"
      aria-label={segments.map((segment) => `${segment.value} ${t(segment.label)}`).join(', ')}
    >
      {segments
        .filter((segment) => segment.value > 0)
        .map((segment) => (
          <span
            key={segment.id}
            className="rounded-full"
            title={t('message', { value1: segment.value, value2: t(segment.label) })}
            style={{ width: `${(segment.value / scale) * 100}%`, background: segment.color }}
          />
        ))}
    </span>
  );
};
