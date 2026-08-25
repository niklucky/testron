import type { RevisionStep } from '@testron/protocol';
import type { Step } from '@testron/domain/steps/schema';

export type StepMutationCommand =
  | { type: 'delete-step'; index: number }
  | { type: 'update-step'; index: number; step: Step }
  | { type: 'replace-steps'; steps: Step[] };

export const applyStepMutation = (
  steps: readonly Step[],
  command: StepMutationCommand,
): Step[] | undefined => {
  if (command.type === 'replace-steps') return [...command.steps];
  if (!Number.isInteger(command.index) || command.index < 0 || command.index >= steps.length)
    return undefined;
  const next = [...steps];
  if (command.type === 'delete-step') next.splice(command.index, 1);
  else next[command.index] = command.step;
  return next;
};

export const reconcileRevisionSteps = (
  previous: readonly RevisionStep[],
  steps: readonly Step[],
  createId: () => string = () => crypto.randomUUID(),
): RevisionStep[] => {
  const remaining = new Set(previous.map((_, index) => index));
  const chosen = steps.map(() => -1);

  // Reserve exact payload matches first so inserting or deleting a step cannot
  // steal the stable ID of an unchanged step later in the revision.
  steps.forEach((step, nextIndex) => {
    const serialized = JSON.stringify(step);
    const exact = previous.findIndex(
      (entry, index) => remaining.has(index) && JSON.stringify(entry.payload) === serialized,
    );
    if (exact < 0) return;
    chosen[nextIndex] = exact;
    remaining.delete(exact);
  });

  return steps.map((payload, index) => {
    let previousIndex = chosen[index];
    if (previousIndex < 0) {
      previousIndex = remaining.has(index) ? index : (remaining.values().next().value ?? -1);
      if (previousIndex >= 0) remaining.delete(previousIndex);
    }
    return {
      id: previousIndex >= 0 ? previous[previousIndex]!.id : createId(),
      payload,
    };
  });
};
