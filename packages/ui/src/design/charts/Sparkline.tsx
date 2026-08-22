/**
 * A trend at glyph size: shape only, no axis, no numbers. It answers "is this
 * getting worse?" and nothing else — put the actual figure next to it.
 *
 * The final point is dotted, and turns critical when the series ends at its
 * own maximum, which is the one state worth catching in a scanning read.
 */
export const Sparkline = ({
  values,
  width = 46,
  height = 16,
  label,
}: {
  values: number[];
  width?: number;
  height?: number;
  label?: string;
}) => {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => [
    (index / (values.length - 1)) * width,
    height - 2 - (value / max) * (height - 4),
  ]);
  const [lastX, lastY] = points[points.length - 1];
  const peaking = values[values.length - 1] >= max;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <polyline
        points={points.map(([x, y]) => `${x},${y}`).join(' ')}
        fill="none"
        stroke="var(--ui-ink-3)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={lastX}
        cy={lastY}
        r="2"
        fill={peaking ? 'var(--ui-critical)' : 'var(--ui-ink-3)'}
      />
    </svg>
  );
};
