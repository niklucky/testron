export type LegendItem = { id: string; label: string; color: string };

/**
 * Every chart in the app ships one of these. It is what makes a status colour
 * legible to someone who cannot separate the hues — and it is cheap, so there
 * is no reason to leave it off.
 */
export const Legend = ({
  items,
  shape = 'dot',
  className = '',
}: {
  items: LegendItem[];
  shape?: 'dot' | 'square';
  className?: string;
}) => (
  <span className={`flex items-center gap-2.5 ${className}`}>
    {items.map((item) => (
      <span key={item.id} className="flex items-center gap-1 text-xs text-ink-3">
        <span
          className={`h-[7px] w-[7px] shrink-0 ${shape === 'dot' ? 'rounded-full' : 'rounded-[2px]'}`}
          style={{ background: item.color }}
        />
        {item.label}
      </span>
    ))}
  </span>
);
