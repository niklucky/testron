import { useTranslation } from '@warpunit/slang-react';
import { useEffect, useState } from 'react';

import { Badge, Icon, IconButton, Kbd, PulseDot } from '../design';
import { clock, sentence } from './codegen';
import { displayRecordShortcut } from './hotkeys';
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
  repickingId,
  onSelect,
  onExpand,
  onUseAlternative,
  onEditLocator,
  onRepick,
  onCancelRepick,
  onConvertToAssertion,
  onDelete,
}: {
  steps: RecordedStep[];
  status: RecordStatus;
  selectedId?: string;
  /** The step whose alternative locators are open. */
  expandedId?: string;
  repickingId?: string;
  onSelect: (id: string) => void;
  onExpand: (id: string) => void;
  onUseAlternative: (id: string, locator: string) => void;
  onEditLocator: (id: string, locator: string) => void;
  onRepick: (id: string) => void;
  onCancelRepick: () => void;
  onConvertToAssertion: (id: string) => void;
  onDelete: (id: string) => void;
}) => {
  const { t } = useTranslation();
  return (
    <div className="pb-4">
      {steps.length === 0 && (
        <p className="px-4 py-10 text-center leading-6 text-ink-3">
          {t('press')} <Kbd>{displayRecordShortcut('record')}</Kbd> {t('and_drive_the_page')}
          <br />
          {t('every_click_keystroke_and_assertion_lands_here_as_a_step')}
        </p>
      )}

      <ol>
        {steps.map((step, index) => {
          const style = stepStyle[step.kind];
          const on = step.id === selectedId;
          const open = step.id === expandedId;
          const repicking = step.id === repickingId;
          return (
            <li key={step.id}>
              <div
                role="button"
                tabIndex={0}
                aria-current={on}
                onClick={() => onSelect(step.id)}
                onKeyDown={(event) => event.key === 'Enter' && onSelect(step.id)}
                className={`group grid cursor-default grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-2 border-l-2 px-3 py-2 ${
                  repicking
                    ? 'border-warning bg-warning/10'
                    : on
                      ? 'border-accent bg-accent-wash'
                      : 'border-transparent hover:bg-raised/60'
                }`}
              >
                <span className="ui-mono pt-[3px] text-ink-3">{index + 1}</span>

                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-ink">
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
                      className="ui-mono mt-1 flex w-full items-center gap-1 rounded px-1 py-px text-left text-ink-3 hover:bg-raised hover:text-ink-2"
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
                        className="ui-mono mt-0.5 block w-full truncate rounded border border-line-soft px-1 py-px text-left text-ink-3 hover:border-accent hover:text-accent"
                      >
                        {alternative}
                      </button>
                    ))}

                  {open && step.locator && (
                    <LocatorEditor id={step.id} locator={step.locator} onSave={onEditLocator} />
                  )}

                  {step.warning && (
                    <Badge tone="warning" icon="alert" size="sm" className="mt-1.5">
                      {step.secret ? t('secret') : t('locator_2')}
                    </Badge>
                  )}
                </span>

                <span className="flex items-center gap-1 pt-[2px]">
                  <span className="ui-mono text-ink-3 group-hover:hidden">{clock(step.at)}</span>
                  {step.locator && (
                    <IconButton
                      icon={repicking ? 'close' : 'focus'}
                      size="sm"
                      active={repicking}
                      label={
                        repicking
                          ? `Cancel repicking step ${index + 1}`
                          : `Repick element for step ${index + 1}`
                      }
                      className={repicking ? '' : 'hidden group-hover:grid'}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (repicking) onCancelRepick();
                        else onRepick(step.id);
                      }}
                    />
                  )}
                  <IconButton
                    icon="eye"
                    size="sm"
                    label={t('convert_step_to_assertion', { value1: index + 1 })}
                    className={`hidden ${step.kind.startsWith('assert') ? '' : 'group-hover:grid'}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onConvertToAssertion(step.id);
                    }}
                  />
                  <IconButton
                    icon="trash"
                    size="sm"
                    label={t('delete_step', { value1: index + 1 })}
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
        <p className="flex items-center gap-2 px-3 py-2.5 text-ink-3">
          <PulseDot tone="critical" label={t('recording')} />
          {t('listening_for_the_next_interaction')}
        </p>
      )}

      {status === 'paused' && steps.length > 0 && (
        <p className="px-3 py-2.5 text-ink-3">
          {t('paused_clicks_on_the_page_are_ignored_until_you_resume')}
        </p>
      )}
    </div>
  );
};

const LocatorEditor = ({
  id,
  locator,
  onSave,
}: {
  id: string;
  locator: string;
  onSave: (id: string, locator: string) => void;
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(locator);
  useEffect(() => setDraft(locator), [locator]);
  return (
    <form
      className="mt-1 flex gap-1"
      onClick={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.trim() && draft !== locator) onSave(id, draft.trim());
      }}
    >
      <input
        aria-label={t('edit_locator')}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="ui-mono min-w-0 flex-1 rounded border border-line bg-plane px-1 py-1 text-ink outline-none focus:border-accent"
      />
      <button
        type="submit"
        disabled={!draft.trim() || draft === locator}
        className="rounded border border-line px-2 text-ink-2 hover:border-accent disabled:opacity-40"
      >
        {t('save')}
      </button>
    </form>
  );
};
