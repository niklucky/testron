import { Tooltip } from '../components/Tooltip';

export type RibbonCell = { id: string; color: string; label: string };

/**
 * A run of outcomes, oldest to newest, one cell each. It is deliberately not a
 * chart: there is no magnitude here, only a pattern — alternating cells mean
 * flaky, a solid tail means broken.
 */
export const Ribbon = ({
  cells,
  height = 36,
  className = '',
}: {
  cells: RibbonCell[];
  height?: number;
  className?: string;
}) => (
  <div className={`flex gap-[3px] ${className}`}>
    {cells.map((cell, index) => (
      <Tooltip key={`${cell.id}-${index}`} className="flex-1" content={cell.label}>
        <span
          className="block w-full rounded-[3px]"
          style={{ height, background: cell.color }}
          title={cell.label}
        />
      </Tooltip>
    ))}
  </div>
);
