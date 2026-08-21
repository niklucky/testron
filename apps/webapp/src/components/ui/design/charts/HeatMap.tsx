import { useTranslation } from '@warpunit/slang-react';
import type { ReactNode } from 'react';

import { Tooltip } from '../components/Tooltip';
import { heatEmpty, heatRamp } from '../tone';

export type HeatRow = { id: string; label: string; values: number[] };

/**
 * Density over time, one row per subject. The ramp is ordinal — a single hue
 * in four steps — because the reader's question is "more or less?", not
 * "which category?". Zero is a track colour, not the first step, so an idle
 * row stays visibly empty.
 */
export const HeatMap = ({
  rows,
  thresholds,
  ramp = heatRamp,
  cellLabel,
  legendLabels,
  meta,
}: {
  rows: HeatRow[];
  /** Upper bounds for each ramp step below the last, e.g. [3, 5, 7]. */
  thresholds: number[];
  ramp?: string[];
  cellLabel: (row: HeatRow, value: number, index: number) => ReactNode;
  /** One more label than there are steps — the first describes the empty cell. */
  legendLabels: string[];
  meta?: ReactNode;
}) => {
  const { t } = useTranslation();
  const bin = (value: number) => {
    if (value === 0) return -1;
    const step = thresholds.findIndex((limit) => value < limit);
    return step === -1 ? ramp.length - 1 : step;
  };

  return (
    <div>
      <div className="space-y-[3px]">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-2">
            <span className="w-[88px] shrink-0 truncate text-xs text-ink-3">{t(row.label)}</span>
            <span className="flex flex-1 gap-[3px]">
              {row.values.map((value, index) => {
                const step = bin(value);
                return (
                  <Tooltip key={index} className="flex-1" content={cellLabel(row, value, index)}>
                    <span
                      className="block h-[14px] w-full rounded-[2px]"
                      style={{ background: step < 0 ? heatEmpty : ramp[step] }}
                    />
                  </Tooltip>
                );
              })}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-xs text-ink-3">
        <span>{t('less')}</span>
        {[heatEmpty, ...ramp].map((background, index) => (
          <span
            key={background}
            className="h-[10px] w-[14px] rounded-[2px]"
            style={{ background }}
            title={t(legendLabels[index])}
          />
        ))}
        <span>{t('more')}</span>
        {meta && <span className="ml-auto">{meta}</span>}
      </div>
    </div>
  );
};
