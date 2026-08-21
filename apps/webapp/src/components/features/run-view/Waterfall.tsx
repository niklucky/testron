import { useTranslation } from '@warpunit/slang-react';
import { Badge, Icon, Kbd, Tabs, toneFill } from '../../ui/design';
import { ms } from '../dashboard/format';
import { sentence } from '../record/codegen';
import { stepStyle, type RecordedStep } from '../record/types';
import type { Attempt, StepResult } from './types';

const statusTone = {
  passed: 'good',
  failed: 'critical',
  skipped: 'neutral',
  running: 'accent',
} as const;

/**
 * Where the run spent its time.
 *
 * A list of steps with ticks would say what happened; the bars say what it
 * cost, which is the question a report gets asked most often after "why did it
 * fail". Each bar starts where the step started, so a slow step pushes
 * everything after it to the right and the shape of the run is visible without
 * reading a single number.
 *
 * The comparison column is against the last green run of the same test — the
 * only baseline that means anything.
 */
export const Waterfall = ({
  steps,
  attempt,
  attempts,
  attemptNumber,
  onAttempt,
  baseline,
  expanded,
  onExpand,
}: {
  steps: RecordedStep[];
  attempt: Attempt;
  attempts: Attempt[];
  attemptNumber: number;
  onAttempt: (number: number) => void;
  baseline?: Attempt;
  expanded?: number;
  onExpand: (index?: number) => void;
}) => {
  const { t } = useTranslation();
  const total = Math.max(
    1,
    attempt.steps.reduce((sum, result) => sum + result.ms, 0),
  );
  let offset = 0;
  const rows = attempt.steps.map((result) => {
    const row = { result, start: offset };
    offset += result.ms;
    return row;
  });

  return (
    <section className="min-w-0">
      <div className="mb-2 flex items-center gap-3">
        {attempts.length > 1 ? (
          <Tabs
            label={t('attempt')}
            value={String(attemptNumber)}
            onChange={(value) => onAttempt(Number(value))}
            items={attempts.map((entry) => ({
              id: String(entry.number),
              label: `Attempt ${entry.number}`,
              icon: entry.verdict === 'passed' ? 'check' : 'alert',
            }))}
          />
        ) : (
          <h2 className="text-md font-semibold">{t('timeline')}</h2>
        )}
        <span className="ml-auto flex items-center gap-3 text-ink-3">
          <span>
            {attempt.steps.filter((result) => result.status === 'passed').length} {t('passed_3')}
          </span>
          {attempt.steps.some((result) => result.status === 'skipped') && (
            <span>
              {attempt.steps.filter((result) => result.status === 'skipped').length}{' '}
              {t('skipped_3')}
            </span>
          )}
          <span className="ui-mono">{ms(attempt.ms)}</span>
        </span>
      </div>

      <ol className="rounded-xl border border-line bg-surface">
        {rows.map(({ result, start }, index) => {
          const step = steps[result.index];
          const tone = statusTone[result.status];
          const before = baseline?.steps[result.index];
          const delta =
            before && before.ms > 0 && result.status === 'passed'
              ? result.ms - before.ms
              : undefined;
          const open = expanded === result.index;
          const style = step ? stepStyle[step.kind] : undefined;

          return (
            <li key={result.index} className={index > 0 ? 'border-t border-line-soft' : ''}>
              <div
                role="button"
                tabIndex={0}
                aria-expanded={open}
                onClick={() => onExpand(open ? undefined : result.index)}
                onKeyDown={(event) =>
                  event.key === 'Enter' && onExpand(open ? undefined : result.index)
                }
                className={`grid cursor-default grid-cols-[26px_minmax(180px,1fr)_minmax(140px,1.3fr)_104px] items-center gap-3 px-3 py-2 ${
                  result.status === 'failed' ? 'bg-critical-wash' : 'hover:bg-raised/50'
                }`}
              >
                <span className="ui-mono flex items-center gap-1 text-ink-3">
                  {result.index + 1}
                </span>

                <span className="flex min-w-0 items-center gap-1.5">
                  {style && (
                    <Icon
                      name={style.icon}
                      size={13}
                      className={
                        result.status === 'skipped'
                          ? 'shrink-0 text-ink-3 opacity-50'
                          : 'shrink-0 text-ink-3'
                      }
                    />
                  )}
                  <span
                    className={`truncate ${
                      result.status === 'skipped' ? 'text-ink-3' : 'text-ink'
                    }`}
                  >
                    {step ? sentence(step) : `Step ${result.index + 1}`}
                  </span>
                </span>

                {/* The bar is the row's real content: offset and length. */}
                <span className="relative h-4 rounded bg-line-soft">
                  {result.ms > 0 && (
                    <span
                      className="absolute inset-y-0 rounded"
                      style={{
                        left: `${(start / total) * 100}%`,
                        width: `${Math.max(1.5, (result.ms / total) * 100)}%`,
                        background: toneFill[tone],
                      }}
                      title={t('at', { value1: ms(result.ms), value2: ms(start) })}
                    />
                  )}
                </span>

                <span className="flex items-center justify-end gap-2">
                  {delta !== undefined && Math.abs(delta) > 80 && (
                    <span
                      className="ui-mono "
                      style={{ color: delta > 0 ? 'var(--ui-serious)' : 'var(--ui-good)' }}
                      title={t('against_the_last_green_run')}
                    >
                      {delta > 0 ? '+' : '−'}
                      {ms(Math.abs(delta))}
                    </span>
                  )}
                  <span className="ui-mono text-ink-2">
                    {result.status === 'skipped' ? '—' : ms(result.ms)}
                  </span>
                </span>
              </div>

              {(open || result.status === 'failed') && (
                <div className="space-y-2 border-t border-line-soft px-3 py-2.5 pl-[38px]">
                  <p className="ui-mono truncate text-ink-3">
                    <Icon name="arrowRight" size={11} className="mr-1 inline" />
                    {result.url}
                  </p>

                  {result.error && (
                    <>
                      <pre className="ui-mono overflow-x-auto whitespace-pre-wrap rounded-md border border-line bg-plane p-2.5 leading-[18px] text-ink-2">
                        {result.error}
                      </pre>
                      <p className="flex items-center gap-2 text-ink-3">
                        <Badge tone="critical" icon="alert" size="sm">
                          {t('stopped_the_run')}
                        </Badge>
                        {t('open_the_trace_at_this_step_with')} <Kbd>{t('t')}</Kbd>
                      </p>
                    </>
                  )}

                  {result.status === 'skipped' && (
                    <p className="text-ink-3">{t('never_ran_the_step_before_it_failed')}</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
};

/** The one-line summary of a step result, for the rail and the banner. */
export const describe = (steps: RecordedStep[], result?: StepResult) =>
  result && steps[result.index] ? sentence(steps[result.index]) : 'the test';
