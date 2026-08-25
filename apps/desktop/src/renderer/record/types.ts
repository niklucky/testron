import type {
  PanelId as WirePanelId,
  RecordedStep as WireStep,
  RecordPanelState,
} from '../../preload/record';
import type { IconName } from '../design';

/**
 * The record screen's vocabulary.
 *
 * The shapes that cross a process boundary are defined once, in
 * preload/record.ts, and narrowed here for the parts of them only the
 * renderer cares about — a step's `spot` is a real place on the page in here,
 * and just a string on the wire.
 */
export type StepKind = WireStep['kind'];
export type Assertion = NonNullable<WireStep['assertion']>;
export type RecordStatus = RecordPanelState['status'];
/** What the next interaction becomes: an action, or an assertion about it. */
export type CaptureMode = RecordPanelState['mode'];
export type PanelId = WirePanelId;
export type StepViewMode = 'tester' | 'developer';

/** Named regions of the recorded page, so a step can point back at one. */
export type SpotId =
  'search' | 'email' | 'address' | 'shipping' | 'save' | 'pay' | 'summary' | 'confirmation';

export type RecordedStep = Omit<WireStep, 'spot'> & { spot?: SpotId };

export type StepStyle = { icon: IconName; verb: string };

/** One icon and one verb per kind — the steps panel and the page tag share it. */
export const stepStyle: Record<StepKind, StepStyle> = {
  navigate: { icon: 'arrowRight', verb: 'Open' },
  click: { icon: 'play', verb: 'Click' },
  fill: { icon: 'pencil', verb: 'Fill' },
  select: { icon: 'caret', verb: 'Select' },
  check: { icon: 'check', verb: 'Check' },
  uncheck: { icon: 'check', verb: 'Uncheck' },
  press: { icon: 'keyboard', verb: 'Press' },
  assert: { icon: 'eye', verb: 'Expect' },
  assertUrl: { icon: 'eye', verb: 'Expect' },
};
