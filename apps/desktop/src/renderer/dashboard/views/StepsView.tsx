import { useTranslation } from '@warpunit/slang-react';
import { Legend, Meter, toneFill, toneInk, toneWash } from '../../design';
import { ms } from '../format';
import { verdictTone } from '../tone';
import type { Failure } from '../types';

/**
 * What the runner did, in order, with the failing step opened in place. The
 * duration bars are relative to the slowest step in *this* run — a timeout is
 * supposed to dwarf everything above it.
 */
export const StepsView = ({ failure }: { failure: Failure }) => {
  const { t } = useTranslation();
  const slowest = Math.max(...failure.steps.map((step) => step.ms));
  const failedAt = failure.steps.findIndex((step) => step.state === 'failed');

  return (
    <div>
      <div className="mb-3 flex items-center gap-3 text-sm text-ink-3">
        <span>
          {failure.steps.length} {t('steps')}
        </span>
        <span>·</span>
        <span>
          {t('failed_at_step')} {failedAt + 1}
        </span>
        <Legend
          className="ml-auto"
          items={(['passed', 'failed', 'skipped'] as const).map((state) => ({
            id: state,
            label: verdictTone[state].label,
            color: toneFill[verdictTone[state].tone],
          }))}
        />
      </div>

      <ol className="relative">
        {failure.steps.map((step, index) => {
          const tone = verdictTone[step.state];
          const failed = step.state === 'failed';
          return (
            <li
              key={step.id}
              className="relative grid grid-cols-[22px_minmax(0,1fr)_116px] items-start gap-3 rounded-lg py-2.5 pl-2 pr-3"
              style={failed ? { background: toneWash.critical } : undefined}
            >
              <span className="flex flex-col items-center gap-1 pt-0.5">
                <span
                  className="ui-mono grid h-[19px] w-[19px] place-items-center rounded-full bg-raised text-xs"
                  style={{ color: toneInk[tone.tone] }}
                  title={tone.label}
                >
                  {tone.glyph}
                </span>
                {index < failure.steps.length - 1 && <span className="h-6 w-px bg-line" />}
              </span>

              <span className="min-w-0">
                <span className="ui-mono block truncate text-base">
                  {step.call}
                  <span className="text-ink-3"> · {step.target}</span>
                </span>
                <span className="mt-1 block text-sm text-ink-3">{step.manual}</span>
                {failed && (
                  <span className="ui-mono mt-2 block whitespace-pre-wrap rounded-md border border-line bg-plane p-2 text-sm leading-[18px] text-ink-2">
                    {failure.message.split('\n').slice(0, 3).join('\n')}
                  </span>
                )}
              </span>

              <span className="flex items-center gap-2 pt-[3px]">
                <Meter
                  className="flex-1"
                  height={4}
                  value={step.state === 'skipped' ? 0 : Math.max(0.04, step.ms / slowest)}
                  tone={failed ? 'critical' : 'accent'}
                  label={t('of', { value1: ms(step.ms), value2: ms(slowest) })}
                />
                <span className="ui-mono w-[46px] shrink-0 text-right text-sm text-ink-3">
                  {step.state === 'skipped' ? '—' : ms(step.ms)}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
