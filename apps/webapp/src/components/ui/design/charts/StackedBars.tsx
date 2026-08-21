import { Tooltip } from '../components/Tooltip';
import type { LegendItem } from './Legend';

export type StackedDatum = {
  key: string;
  /** Full name, used by the tooltip. */
  label: string;
  /** Short axis mark, e.g. a day of the month. Omitted marks are skipped. */
  tick?: string;
  values: Record<string, number>;
};

/**
 * Volume over time, split by outcome. Series order is stacking order, and the
 * first series sits on top — put the series you care about (failures) first so
 * it lands where the eye already is.
 *
 * `compact` keeps only the top and baseline rules: enough to read magnitude,
 * quiet enough to sit inside a row of stat tiles.
 */
export const StackedBars = ({
  data,
  series,
  compact = false,
  unit = 'runs',
}: {
  data: StackedDatum[];
  series: LegendItem[];
  compact?: boolean;
  unit?: string;
}) => {
  const totalOf = (datum: StackedDatum) =>
    series.reduce((sum, entry) => sum + (datum.values[entry.id] ?? 0), 0);
  const max = Math.max(1, ...data.map(totalOf));
  // Round the axis out to a whole step so the gridline labels stay round.
  const scale = Math.max(20, Math.ceil(max / 20) * 20);
  const ticks = (compact ? [4, 0] : [4, 3, 2, 1, 0]).map((step) => (scale / 4) * step);

  return (
    <div className={compact ? 'pt-3' : 'px-4 pb-4 pt-3'}>
      <div className={`relative ${compact ? 'h-[84px]' : 'h-[200px]'}`}>
        {ticks.map((tick) => (
          <div
            key={tick}
            className="absolute inset-x-0 flex items-center gap-2"
            style={{ top: `${(1 - tick / scale) * 100}%` }}
          >
            <span className={`ui-mono shrink-0 text-right text-sm text-ink-3 ${compact ? 'w-5 ' : 'w-7'}`}>
              {tick}
            </span>
            <span className="h-px flex-1 bg-line-soft" />
          </div>
        ))}

        <div
          className={`absolute inset-y-0 right-0 flex items-end ${
            compact ? 'left-7 gap-[2px]' : 'left-9 gap-[4px]'
          }`}
        >
          {data.map((datum) => {
            const total = totalOf(datum);
            const parts = series.filter((entry) => (datum.values[entry.id] ?? 0) > 0);
            return (
              <Tooltip
                key={datum.key}
                className="flex h-full flex-1 flex-col justify-end"
                content={
                  <>
                    <p className="font-semibold text-ink">{datum.label}</p>
                    <p className="mb-1 text-ink-3">
                      {total} {unit}
                    </p>
                    {series.map((entry) => (
                      <p key={entry.id} className="flex items-center gap-1.5 text-sm">
                        <span
                          className="h-[6px] w-[6px] rounded-full"
                          style={{ background: entry.color }}
                        />
                        {entry.label}
                        <span className="ui-mono ml-auto pl-3 font-semibold">
                          {datum.values[entry.id] ?? 0}
                        </span>
                      </p>
                    ))}
                  </>
                }
              >
                <span
                  className="flex flex-col gap-[2px]"
                  style={{ height: `${(total / scale) * 100}%` }}
                >
                  {parts.map((entry, index) => (
                    <span
                      key={entry.id}
                      className={index === 0 ? 'rounded-t-[3px]' : ''}
                      style={{
                        flexGrow: datum.values[entry.id],
                        flexBasis: 0,
                        background: entry.color,
                      }}
                    />
                  ))}
                </span>
              </Tooltip>
            );
          })}
        </div>
      </div>

      {!compact && (
        <div className="mt-2 flex gap-[4px] pl-9">
          {data.map((datum) => (
            <span key={datum.key} className="ui-mono flex-1 text-center text-ink-3">
              {datum.tick ?? ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
