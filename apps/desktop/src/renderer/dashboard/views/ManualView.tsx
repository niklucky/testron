import { Kbd, Meter, TextArea, toneInk } from '../../design';
import { displayShortcut, manualShortcutIds } from '../hotkeys';
import { manualTone } from '../tone';
import type { Failure, ManualVerdict } from '../types';

const verdicts = Object.keys(manualTone) as ManualVerdict[];

/**
 * The same test, written out for a person. This is the hand-off when a failure
 * cannot be reproduced by the runner: a tester walks the steps, records a
 * verdict per step (p / f / x) and leaves notes. No Playwright required.
 */
export const ManualView = ({
  failure,
  results,
  cursor,
  onCursor,
  onVerdict,
}: {
  failure: Failure;
  results: Record<string, ManualVerdict>;
  cursor: number;
  onCursor: (index: number) => void;
  onVerdict: (stepId: string, verdict: ManualVerdict) => void;
}) => {
  const done = failure.steps.filter((step) => results[step.id]).length;

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <div>
          <h3 className="text-md font-semibold">Manual script</h3>
          <p className="mt-0.5 text-sm text-ink-3">
            Generated from {failure.file} — hand this to a tester, no Playwright required.
          </p>
        </div>
        <span className="ml-auto flex items-center gap-2 text-sm text-ink-3">
          {done}/{failure.steps.length} recorded
          <Meter className="w-24" value={done / failure.steps.length} />
        </span>
      </div>

      <ol className="space-y-1.5">
        {failure.steps.map((step, index) => {
          const recorded = results[step.id];
          const active = index === cursor;
          return (
            <li
              key={step.id}
              className={`rounded-lg border p-3 transition-colors ${
                active ? 'border-accent bg-accent-wash' : 'border-line bg-plane'
              }`}
              onClick={() => onCursor(index)}
            >
              <div className="flex items-start gap-3">
                <span className="ui-mono mt-px w-4 shrink-0 text-base text-ink-3">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-md">{step.manual}</p>
                  <p className="mt-1 text-sm text-ink-3">Expected · {step.expected}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {verdicts.map((option) => {
                    const tint = manualTone[option];
                    const on = recorded === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={on}
                        className="flex h-7 items-center gap-1 rounded-md border px-2 text-sm transition-colors"
                        style={{
                          color: on ? toneInk[tint.tone] : 'var(--ui-ink-3)',
                          borderColor: on ? toneInk[tint.tone] : 'var(--ui-line)',
                          background: on ? 'var(--ui-raised)' : 'transparent',
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          onCursor(index);
                          onVerdict(step.id, option);
                        }}
                      >
                        {tint.label}
                        {active && <Kbd>{displayShortcut(manualShortcutIds[option])}</Kbd>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <TextArea
        label="Session notes"
        className="mt-3 h-20"
        placeholder="Reproduced on a cold cache, banner appeared after ~4s…"
      />
    </div>
  );
};
