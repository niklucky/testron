import { useTranslation } from '@warpunit/slang-react';
import { Badge, Icon, IconButton, Meter, StatusDot, toneFill } from '../../ui/design';
import { sentence } from '../record/codegen';
import { stepStyle, type RecordedStep } from '../record/types';
import { Card, EmptyLane, Meta, Step as StepArrow } from './Board';
import { Chip, InlineSelect, InlineText } from './InlineField';
import {
  allEnvironments,
  assertionLabels,
  assertionNeedsValue,
  type Assertion,
  type AssertionKind,
  type Prerequisite,
  type Run,
  type RunVerdict,
  type TestDetail,
} from './types';
import { goToRuns } from '../../../lib/navigation';

const age = (minutes: number) =>
  minutes < 60
    ? `${Math.round(minutes)}m ago`
    : minutes < 1440
      ? `${Math.round(minutes / 60)}h ago`
      : `${Math.round(minutes / 1440)}d ago`;

/* -- column one: what the test is ---------------------------------------- */

export const DetailCard = ({
  detail,
  onDetail,
  onLog,
  metadataEditable = true,
}: {
  detail: TestDetail;
  onDetail: (detail: TestDetail) => void;
  onLog: (message: string) => void;
  metadataEditable?: boolean;
}) => {
  const { t } = useTranslation();
  return (
    <Card className="!p-3">
      <InlineText
        label={t('test_name')}
        value={detail.name}
        onChange={(name) => {
          onDetail({ ...detail, name });
          onLog('Test renamed');
        }}
        className="font-semibold"
      />

      <p className="mb-1.5 mt-3 uppercase tracking-wider text-ink-3">{t('environments')}</p>
      <div className="flex flex-wrap gap-1">
        {(metadataEditable ? allEnvironments : detail.environments).map((environment) => {
          const on = detail.environments.includes(environment);
          return (
            <Chip
              key={environment}
              on={on}
              onClick={
                metadataEditable
                  ? () => {
                      onDetail({
                        ...detail,
                        environments: on
                          ? detail.environments.filter((one) => one !== environment)
                          : [...detail.environments, environment],
                      });
                      onLog(`${environment} ${on ? 'removed from' : 'added to'} this test`);
                    }
                  : undefined
              }
            >
              {environment}
            </Chip>
          );
        })}
      </div>

      {metadataEditable && (
        <>
          <p className="mb-1.5 mt-3 uppercase tracking-wider text-ink-3">{t('tags')}</p>
          <div className="flex flex-wrap items-center gap-1">
            {detail.tags.map((tag) => (
              <Chip
                key={tag}
                on
                onRemove={() =>
                  onDetail({ ...detail, tags: detail.tags.filter((one) => one !== tag) })
                }
              >
                {tag}
              </Chip>
            ))}
            <IconButton
              icon="plus"
              size="sm"
              label={t('add_a_tag')}
              onClick={() =>
                onDetail({ ...detail, tags: [...detail.tags, `tag-${detail.tags.length + 1}`] })
              }
            />
          </div>
        </>
      )}

      <dl className="mt-3 space-y-1 border-t border-line-soft pt-2.5 text-ink-3">
        {[
          ['Created', `${detail.createdAt} · ${detail.createdBy}`],
          ['Updated', detail.updatedAt],
          ['Spec', detail.file],
        ].map(([term, value]) => (
          <div key={term} className="flex gap-2">
            <dt className="w-14 shrink-0">{term}</dt>
            <dd className={`min-w-0 truncate ${term === 'Spec' ? 'ui-mono' : ''}`}>{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
};

/* -- column two: what has to be true first ------------------------------- */

export const PrerequisiteCard = ({
  prerequisite,
  onEdit,
  onDelete,
}: {
  prerequisite: Prerequisite;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <Card className="group">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <span className="block whitespace-pre-wrap break-words text-ink">{prerequisite}</span>
        </span>
        <span className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
          <IconButton icon="pencil" size="sm" label={t('edit_prerequisite')} onClick={onEdit} />
          <IconButton icon="trash" size="sm" label={t('delete_prerequisite')} onClick={onDelete} />
        </span>
      </div>
    </Card>
  );
};

export const PrerequisitesEmpty = () => {
  const { t } = useTranslation();
  return (
    <EmptyLane>
      {t('nothing_has_to_be_true_before_this_test_runs')}
      <br />
      {t('add_a_seeded_basket_a_flag_or_a_signed_in_session')}
    </EmptyLane>
  );
};

/* -- column three: what it does ------------------------------------------ */

export const StepCard = ({
  step,
  index,
  failed,
  running,
  passed,
  error,
  onStep,
  onRepick,
  onAddAssertion,
  onDelete,
  locatorEditable = true,
}: {
  step: RecordedStep;
  index: number;
  failed: boolean;
  running: boolean;
  passed: boolean;
  error?: string;
  onStep: (step: RecordedStep) => void;
  onRepick?: () => void;
  onAddAssertion: () => void;
  onDelete: () => void;
  locatorEditable?: boolean;
}) => {
  const { t } = useTranslation();
  const style = stepStyle[step.kind];
  return (
    <Card
      className="group"
      tone={failed ? 'var(--ui-critical)' : running ? 'var(--ui-accent)' : undefined}
    >
      <div className="flex items-start gap-2">
        <span className="ui-mono w-4 shrink-0 pt-px text-ink-3">{index + 1}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-ink">
            <Icon name={style.icon} size={13} className="shrink-0 text-ink-3" />
            <span className="truncate">{sentence(step)}</span>
          </span>

          {/* The two parts a person actually edits: what it types, and what it
              aims at. Everything else about a step is generated. */}
          {step.value !== undefined && !step.secret && (
            <span className="mt-1 flex items-center gap-1 text-ink-3">
              {t('value_2')}
              <InlineText
                label={t('step_value_2', { value1: index + 1 })}
                mono
                value={step.value}
                onChange={(value) => onStep({ ...step, value })}
                className="text-ink-2"
              />
            </span>
          )}
          {step.locator && locatorEditable && (
            <>
              <InlineText
                label={t('step_locator', { value1: index + 1 })}
                mono
                value={step.locator}
                onChange={(locator) => onStep({ ...step, locator })}
                className="mt-1 text-ink-3"
              />
              {step.alternatives.length > 0 && (
                <select
                  aria-label={t('step_recorded_locator_alternatives', { value1: index + 1 })}
                  defaultValue=""
                  onChange={(event) => {
                    if (event.target.value) onStep({ ...step, locator: event.target.value });
                    event.target.value = '';
                  }}
                  className="ui-mono mt-1 w-full rounded border border-line bg-plane px-1 py-1 text-ink-3 outline-none hover:border-accent"
                >
                  <option value="">{t('use_a_recorded_alternative')}</option>
                  {step.alternatives.map((locator) => (
                    <option key={locator} value={locator}>
                      {locator}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
          {step.locator && !locatorEditable && (
            <span className="ui-mono mt-1 block truncate text-ink-3">{step.locator}</span>
          )}
          {step.secret && (
            <Badge tone="warning" icon="alert" size="sm" className="mt-1.5">
              {step.secret}
            </Badge>
          )}
          {failed && (
            <div className="mt-2 rounded-md border border-critical/40 bg-critical/10 p-2">
              <Badge tone="critical" icon="alert" size="sm">
                {t('failed_here')}
              </Badge>
              {error && (
                <pre
                  aria-label={t('step_error')}
                  className="ui-mono mt-1.5 max-h-28 overflow-auto whitespace-pre-wrap text-critical"
                >
                  {error}
                </pre>
              )}
            </div>
          )}
          {passed && !failed && (
            <span className="mt-1.5 flex items-center gap-1 text-good">
              <Icon name="check" size={11} /> {t('passed_3')}
            </span>
          )}
        </span>
        <span className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
          {step.locator && onRepick && (
            <IconButton
              icon="focus"
              size="sm"
              label={t('repick_element_for_step', { value1: index + 1 })}
              onClick={onRepick}
            />
          )}
          {/* An assertion is added where it belongs — under the step that
              earns it — rather than at the bottom of a separate list. */}
          <IconButton
            icon="eye"
            size="sm"
            label={t('assert_something_after_step', { value1: index + 1 })}
            onClick={onAddAssertion}
          />
          <IconButton
            icon="trash"
            size="sm"
            label={t('delete_step', { value1: index + 1 })}
            onClick={onDelete}
          />
        </span>
      </div>
    </Card>
  );
};

export { StepArrow };

/* -- what each step proves, hanging off the step ------------------------- */

/**
 * An assertion card sits under the step it follows, indented and on a branch.
 *
 * That indent replaces the "after step" field this card used to carry: its
 * anchor is now something you can see instead of something you have to read.
 * Moving it is therefore a move *between steps* — the two arrows — rather than
 * a number picked from a list.
 */
export const AssertionCard = ({
  assertion,
  canMoveUp,
  canMoveDown,
  onAssertion,
  onMove,
  onDelete,
  subjectEditable = true,
  locatorEditable = false,
  kinds,
  status,
  error,
}: {
  assertion: Assertion;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onAssertion: (assertion: Assertion) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  subjectEditable?: boolean;
  locatorEditable?: boolean;
  kinds?: AssertionKind[];
  status?: 'pending' | 'running' | 'passed' | 'failed';
  error?: string;
}) => {
  const { t } = useTranslation();
  return (
    <Card
      className="group"
      tone={
        status === 'failed'
          ? 'var(--ui-critical)'
          : status === 'running'
            ? 'var(--ui-accent)'
            : undefined
      }
    >
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <Icon name="eye" size={13} className="shrink-0 text-good" />
            {subjectEditable ? (
              <InlineText
                label={t('assertion_subject')}
                value={assertion.label}
                onChange={(label) => onAssertion({ ...assertion, label })}
                className=""
              />
            ) : (
              <span className="truncate ">{assertion.label}</span>
            )}
          </span>

          <span className="mt-1 flex flex-wrap items-center gap-1 text-ink-3">
            <InlineSelect
              label={t('assertion')}
              value={assertion.kind}
              options={(kinds ?? (Object.keys(assertionLabels) as AssertionKind[])).map((id) => ({
                id,
                label: assertionLabels[id],
              }))}
              onChange={(kind) => onAssertion({ ...assertion, kind })}
              className=""
            />
            {assertionNeedsValue(assertion.kind) && (
              <InlineText
                label={
                  assertion.kind === 'countExactly' || assertion.kind === 'countAtLeast'
                    ? t('expected_count')
                    : t('expected_value')
                }
                mono
                value={assertion.expected}
                onChange={(expected) => onAssertion({ ...assertion, expected })}
                className="text-ink-2"
              />
            )}
          </span>

          {assertion.locator && locatorEditable && (
            <InlineText
              label={t('assertion_locator')}
              mono
              value={assertion.locator}
              onChange={(locator) => onAssertion({ ...assertion, locator })}
              className="mt-1 text-ink-3"
            />
          )}
          {assertion.locator && !locatorEditable && (
            <span className="ui-mono mt-1 block truncate text-ink-3">{assertion.locator}</span>
          )}
          {status === 'failed' && (
            <div className="mt-2 rounded-md border border-critical/40 bg-critical/10 p-2">
              <Badge tone="critical" icon="alert" size="sm">
                {t('assertion_failed')}
              </Badge>
              {error && (
                <pre
                  aria-label={t('assertion_error')}
                  className="ui-mono mt-1.5 max-h-28 overflow-auto whitespace-pre-wrap text-critical"
                >
                  {error}
                </pre>
              )}
            </div>
          )}
          {status === 'passed' && (
            <span className="mt-1.5 flex items-center gap-1 text-good">
              <Icon name="check" size={11} /> {t('passed_3')}
            </span>
          )}
        </span>
        <span className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
          <IconButton
            icon="arrowUp"
            size="sm"
            label={t('attach_to_the_previous_step')}
            disabled={!canMoveUp}
            onClick={() => onMove(-1)}
          />
          <IconButton
            icon="arrowDown"
            size="sm"
            label={t('attach_to_the_next_step')}
            disabled={!canMoveDown}
            onClick={() => onMove(1)}
          />
          <IconButton icon="trash" size="sm" label={t('delete_assertion')} onClick={onDelete} />
        </span>
      </div>
    </Card>
  );
};

/* -- column five: how it went -------------------------------------------- */

const verdictTone: Record<
  RunVerdict,
  { tone: 'good' | 'critical' | 'accent' | 'neutral'; label: string }
> = {
  passed: { tone: 'good', label: 'Passed' },
  failed: { tone: 'critical', label: 'Failed' },
  running: { tone: 'accent', label: 'Running' },
  cancelled: { tone: 'neutral', label: 'Cancelled' },
};

export const RunCard = ({
  run,
  total,
  selected,
  onClick,
  onLog,
  reportAvailable = true,
}: {
  run: Run;
  total: number;
  selected: boolean;
  onClick: () => void;
  onLog: (message: string) => void;
  reportAvailable?: boolean;
}) => {
  const { t } = useTranslation();
  const verdict = verdictTone[run.verdict];
  return (
    <Card selected={selected} onClick={onClick} className="group">
      <div className="flex items-center gap-2">
        <StatusDot tone={verdict.tone} label={verdict.label} />
        <span className="text-ink">{t(verdict.label)}</span>
        <span className="ui-mono ml-auto text-ink-3">
          {run.verdict === 'running' ? '…' : `${run.seconds.toFixed(1)}s`}
        </span>
      </div>

      <Meter
        className="mt-2"
        height={4}
        value={run.completed / total}
        tone={verdict.tone === 'neutral' ? 'accent' : verdict.tone}
        label={t('of_steps', { value1: run.completed, value2: total })}
      />

      <Meta>
        <span style={{ color: toneFill.neutral }}>{run.environment}</span>·
        <span className="truncate">{run.by}</span>·<span>{age(run.minutesAgo)}</span>
      </Meta>

      {run.error && run.verdict !== 'running' && (
        <div className="mt-2 rounded-md border border-critical/40 bg-critical/10 p-2">
          <p className="font-medium text-critical">
            {run.failedStepId ? t('failed_step') : t('runner_error')}
          </p>
          <pre
            aria-label={t('run_error')}
            className="ui-mono mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-ink-2"
          >
            {run.error}
          </pre>
        </div>
      )}

      {reportAvailable && run.verdict !== 'running' && (
        <button
          type="button"
          className="mt-1.5 flex items-center gap-1 text-ink-3 opacity-0 hover:text-accent group-hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onLog(`Report · ${run.id}`);
            goToRuns();
          }}
        >
          <Icon name="camera" size={11} /> {t('open_report')}
        </button>
      )}
    </Card>
  );
};
