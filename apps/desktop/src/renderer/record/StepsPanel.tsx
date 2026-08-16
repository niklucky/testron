import { Badge, Icon, IconButton, Kbd, PulseDot } from '../design';
import { clock, sentence } from './codegen';
import { stepStyle, type RecordedStep, type RecordStatus } from './types';

/**
 * The manual reading of the take: what a person would do, in order, in words
 * they could follow without opening the spec. Every row also carries the
 * locator the recorder settled on, because the locator is the part that goes
 * wrong later — showing it while the page is still on screen is the cheapest
 * moment to fix it.
 */
export const StepsPanel = ({
  steps,
  status,
  selectedId,
  expandedId,
  onSelect,
  onExpand,
  onUseAlternative,
  onDelete,
}: {
  steps: RecordedStep[];
  status: RecordStatus;
  selectedId?: string;
  /** The step whose alternative locators are open. */
  expandedId?: string;
  onSelect: (id: string) => void;
  onExpand: (id: string) => void;
  onUseAlternative: (id: string, locator: string) => void;
  onDelete: (id: string) => void;
}) => (
  <div className="pb-4">
    {steps.length === 0 && (
      <p className="px-4 py-10 text-center text-base leading-6 text-ink-3">
        Press <Kbd>R</Kbd> and drive the page.
        <br />
        Every click, keystroke and assertion lands here as a step.
      </p>
    )}

    <ol>
      {steps.map((step, index) => {
        const style = stepStyle[step.kind];
        const on = step.id === selectedId;
        const open = step.id === expandedId;
        return (
          <li key={step.id}>
            <div
              role="button"
              tabIndex={0}
              aria-current={on}
              onClick={() => onSelect(step.id)}
              onKeyDown={(event) => event.key === 'Enter' && onSelect(step.id)}
              className={`group grid cursor-default grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-2 border-l-2 px-3 py-2 ${
                on ? 'border-accent bg-accent-wash' : 'border-transparent hover:bg-raised/60'
              }`}
            >
              <span className="ui-mono pt-[3px] text-xs text-ink-3">{index + 1}</span>

              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-base text-ink">
                  <Icon
                    name={style.icon}
                    size={13}
                    className={step.kind.startsWith('assert') ? 'text-good' : 'text-ink-3'}
                  />
                  <span className="truncate">{sentence(step)}</span>
                </span>

                {step.locator && (
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={(event) => {
                      event.stopPropagation();
                      onExpand(step.id);
                    }}
                    className="ui-mono mt-1 flex w-full items-center gap-1 rounded px-1 py-px text-left text-xs text-ink-3 hover:bg-raised hover:text-ink-2"
                  >
                    <span className="truncate">{step.locator}</span>
                    {step.alternatives.length > 0 && (
                      <span className="shrink-0 text-ink-3">+{step.alternatives.length}</span>
                    )}
                  </button>
                )}

                {open &&
                  step.alternatives.map((alternative) => (
                    <button
                      key={alternative}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onUseAlternative(step.id, alternative);
                      }}
                      className="ui-mono mt-0.5 block w-full truncate rounded border border-line-soft px-1 py-px text-left text-xs text-ink-3 hover:border-accent hover:text-accent"
                    >
                      {alternative}
                    </button>
                  ))}

                {step.warning && (
                  <Badge tone="warning" icon="alert" size="sm" className="mt-1.5">
                    {step.secret ? 'Secret' : 'Locator'}
                  </Badge>
                )}
              </span>

              <span className="flex items-center gap-1 pt-[2px]">
                <span className="ui-mono text-xs text-ink-3 group-hover:hidden">
                  {clock(step.at)}
                </span>
                <IconButton
                  icon="trash"
                  size="sm"
                  label={`Delete step ${index + 1}`}
                  className="hidden group-hover:grid"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(step.id);
                  }}
                />
              </span>
            </div>
          </li>
        );
      })}
    </ol>

    {status === 'recording' && (
      <p className="flex items-center gap-2 px-3 py-2.5 text-base text-ink-3">
        <PulseDot tone="critical" label="Recording" />
        Listening for the next interaction…
      </p>
    )}

    {status === 'paused' && steps.length > 0 && (
      <p className="px-3 py-2.5 text-base text-ink-3">
        Paused · clicks on the page are ignored until you resume.
      </p>
    )}
  </div>
);
