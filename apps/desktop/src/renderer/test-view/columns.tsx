import { Badge, Icon, IconButton, Meter, StatusDot, toneFill } from '../design';
import { sentence } from '../record/codegen';
import { stepStyle, type RecordedStep } from '../record/types';
import { Card, EmptyLane, Meta, Step as StepArrow } from './Board';
import { Chip, InlineSelect, InlineText } from './InlineField';
import {
  allEnvironments,
  assertionLabels,
  assertionNeedsValue,
  prerequisiteLabels,
  type Assertion,
  type AssertionKind,
  type Prerequisite,
  type Run,
  type RunVerdict,
  type TestDetail,
} from './types';

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
}) => (
  <Card className="!p-3">
    <InlineText
      label="Test name"
      value={detail.name}
      onChange={(name) => {
        onDetail({ ...detail, name });
        onLog('Test renamed');
      }}
      className="text-md font-semibold"
    />

    <p className="mb-1.5 mt-3 text-xs uppercase tracking-wider text-ink-3">Environments</p>
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
        <p className="mb-1.5 mt-3 text-xs uppercase tracking-wider text-ink-3">Tags</p>
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
            label="Add a tag"
            onClick={() =>
              onDetail({ ...detail, tags: [...detail.tags, `tag-${detail.tags.length + 1}`] })
            }
          />
        </div>
      </>
    )}

    <dl className="mt-3 space-y-1 border-t border-line-soft pt-2.5 text-xs text-ink-3">
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

/* -- column two: what has to be true first ------------------------------- */

export const PrerequisiteCard = ({
  prerequisite,
  onEdit,
  onDelete,
}: {
  prerequisite: Prerequisite;
  onEdit: () => void;
  onDelete: () => void;
}) => (
  <Card className="group">
    <div className="flex items-start gap-2">
      <span className="min-w-0 flex-1">
        <Badge size="sm" className="mb-1">
          {prerequisiteLabels[prerequisite.kind]}
        </Badge>
        <span className="block truncate text-base text-ink">{prerequisite.title}</span>
        <span className="ui-mono mt-1 block truncate text-xs text-ink-3">{prerequisite.value}</span>
      </span>
      <span className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
        <IconButton icon="pencil" size="sm" label="Edit prerequisite" onClick={onEdit} />
        <IconButton icon="trash" size="sm" label="Delete prerequisite" onClick={onDelete} />
      </span>
    </div>
  </Card>
);

export const PrerequisitesEmpty = () => (
  <EmptyLane>
    Nothing has to be true before this test runs.
    <br />
    Add a seeded basket, a flag, or a signed-in session.
  </EmptyLane>
);

/* -- column three: what it does ------------------------------------------ */

export const StepCard = ({
  step,
  index,
  failed,
  running,
  passed,
  onStep,
  onAddAssertion,
  onDelete,
  locatorEditable = true,
}: {
  step: RecordedStep;
  index: number;
  failed: boolean;
  running: boolean;
  passed: boolean;
  onStep: (step: RecordedStep) => void;
  onAddAssertion: () => void;
  onDelete: () => void;
  locatorEditable?: boolean;
}) => {
  const style = stepStyle[step.kind];
  return (
    <Card
      className="group"
      tone={failed ? 'var(--ui-critical)' : running ? 'var(--ui-accent)' : undefined}
    >
      <div className="flex items-start gap-2">
        <span className="ui-mono w-4 shrink-0 pt-px text-xs text-ink-3">{index + 1}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-base text-ink">
            <Icon name={style.icon} size={13} className="shrink-0 text-ink-3" />
            <span className="truncate">{sentence(step)}</span>
          </span>

          {/* The two parts a person actually edits: what it types, and what it
              aims at. Everything else about a step is generated. */}
          {step.value !== undefined && !step.secret && (
            <span className="mt-1 flex items-center gap-1 text-xs text-ink-3">
              value
              <InlineText
                label={`Step ${index + 1} value`}
                mono
                value={step.value}
                onChange={(value) => onStep({ ...step, value })}
                className="text-xs text-ink-2"
              />
            </span>
          )}
          {step.locator && locatorEditable && (
            <InlineText
              label={`Step ${index + 1} locator`}
              mono
              value={step.locator}
              onChange={(locator) => onStep({ ...step, locator })}
              className="mt-1 text-xs text-ink-3"
            />
          )}
          {step.locator && !locatorEditable && (
            <span className="ui-mono mt-1 block truncate text-xs text-ink-3">{step.locator}</span>
          )}
          {step.secret && (
            <Badge tone="warning" icon="alert" size="sm" className="mt-1.5">
              {step.secret}
            </Badge>
          )}
          {failed && (
            <Badge tone="critical" icon="alert" size="sm" className="mt-1.5">
              Failed here
            </Badge>
          )}
          {passed && !failed && (
            <span className="mt-1.5 flex items-center gap-1 text-xs text-good">
              <Icon name="check" size={11} /> passed
            </span>
          )}
        </span>
        <span className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
          {/* An assertion is added where it belongs — under the step that
              earns it — rather than at the bottom of a separate list. */}
          <IconButton
            icon="eye"
            size="sm"
            label={`Assert something after step ${index + 1}`}
            onClick={onAddAssertion}
          />
          <IconButton
            icon="trash"
            size="sm"
            label={`Delete step ${index + 1}`}
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
  kinds,
}: {
  assertion: Assertion;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onAssertion: (assertion: Assertion) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  subjectEditable?: boolean;
  kinds?: AssertionKind[];
}) => (
  <Card className="group">
    <div className="flex items-start gap-2">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <Icon name="eye" size={13} className="shrink-0 text-good" />
          {subjectEditable ? (
            <InlineText
              label="Assertion subject"
              value={assertion.label}
              onChange={(label) => onAssertion({ ...assertion, label })}
              className="text-base"
            />
          ) : (
            <span className="truncate text-base">{assertion.label}</span>
          )}
        </span>

        <span className="mt-1 flex flex-wrap items-center gap-1 text-sm text-ink-3">
          <InlineSelect
            label="Assertion"
            value={assertion.kind}
            options={(kinds ?? (Object.keys(assertionLabels) as AssertionKind[])).map((id) => ({
              id,
              label: assertionLabels[id],
            }))}
            onChange={(kind) => onAssertion({ ...assertion, kind })}
            className="text-sm"
          />
          {assertionNeedsValue(assertion.kind) && (
            <InlineText
              label="Expected value"
              mono
              value={assertion.expected}
              onChange={(expected) => onAssertion({ ...assertion, expected })}
              className="text-sm text-ink-2"
            />
          )}
        </span>

        {assertion.locator && (
          <span className="ui-mono mt-1 block truncate text-xs text-ink-3">
            {assertion.locator}
          </span>
        )}
      </span>
      <span className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
        <IconButton
          icon="arrowUp"
          size="sm"
          label="Attach to the previous step"
          disabled={!canMoveUp}
          onClick={() => onMove(-1)}
        />
        <IconButton
          icon="arrowDown"
          size="sm"
          label="Attach to the next step"
          disabled={!canMoveDown}
          onClick={() => onMove(1)}
        />
        <IconButton icon="trash" size="sm" label="Delete assertion" onClick={onDelete} />
      </span>
    </div>
  </Card>
);

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
  const verdict = verdictTone[run.verdict];
  return (
    <Card selected={selected} onClick={onClick} className="group">
      <div className="flex items-center gap-2">
        <StatusDot tone={verdict.tone} label={verdict.label} />
        <span className="text-base text-ink">{verdict.label}</span>
        <span className="ui-mono ml-auto text-xs text-ink-3">
          {run.verdict === 'running' ? '…' : `${run.seconds.toFixed(1)}s`}
        </span>
      </div>

      <Meter
        className="mt-2"
        height={4}
        value={run.completed / total}
        tone={verdict.tone === 'neutral' ? 'accent' : verdict.tone}
        label={`${run.completed} of ${total} steps`}
      />

      <Meta>
        <span style={{ color: toneFill.neutral }}>{run.environment}</span>·
        <span className="truncate">{run.by}</span>·<span>{age(run.minutesAgo)}</span>
      </Meta>

      {reportAvailable && run.verdict !== 'running' && (
        <button
          type="button"
          className="mt-1.5 flex items-center gap-1 text-xs text-ink-3 opacity-0 hover:text-accent group-hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onLog(`Report · ${run.id}`);
            window.location.hash = '#/run';
          }}
        >
          <Icon name="camera" size={11} /> Open report
        </button>
      )}
    </Card>
  );
};
