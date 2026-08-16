import { buildSource, type CodeLine } from '../record/codegen';
import type { RecordedStep } from '../record/types';
import type { Assertion, TestBoard } from './types';

/**
 * The board, flattened back into one ordered list of steps.
 *
 * This is the whole answer to "can the spec be regenerated after an edit":
 * the generator is a pure function of the step list — see
 * domain/codegen/playwright.ts, which the recording session already re-runs
 * on every change — so any edit on this board produces a new spec by
 * definition. Nothing has to be parsed, patched or diffed.
 *
 * What does *not* exist is the way back: there is no reader that turns
 * TypeScript into steps. Hand-edited source is therefore a fork, which is why
 * the source sheet makes you say so before it lets you type.
 */

const asStep = (assertion: Assertion): RecordedStep => {
  const base = {
    id: assertion.id,
    label: assertion.label,
    locator: assertion.locator,
    alternatives: [],
    at: 0,
  };
  if (assertion.kind === 'urlPath')
    return { ...base, kind: 'assertUrl', value: assertion.expected };
  const assertionKind =
    assertion.kind === 'textEquals' || assertion.kind === 'textContains'
      ? 'text'
      : assertion.kind === 'value'
        ? 'value'
        : assertion.kind;
  return {
    ...base,
    kind: 'assert',
    assertion: assertionKind,
    value: assertion.expected,
  };
};

/**
 * Which step an assertion hangs off, clamped into the list that actually
 * exists. An anchor can outlive its step — delete step 7 and anything pointing
 * at it has to land somewhere — and an assertion that lands nowhere would
 * quietly vanish from both the board and the spec.
 */
export const anchorOf = (assertion: Assertion, stepCount: number) =>
  Math.min(Math.max(assertion.afterStep, 1), stepCount);

/** The assertions hanging off one step, in board order. */
export const assertionsFor = (board: TestBoard, index: number) =>
  board.assertions.filter((assertion) => anchorOf(assertion, board.steps.length) === index + 1);

/** Actions in order, each followed by whatever it has to prove. */
export const flatten = (board: TestBoard): RecordedStep[] =>
  board.steps.flatMap((step, index) => [step, ...assertionsFor(board, index).map(asStep)]);

export const specFor = (board: TestBoard): CodeLine[] => buildSource(flatten(board));
