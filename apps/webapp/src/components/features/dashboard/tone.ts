import {
  chartFill,
  toneFill,
  type IconName,
  type LegendItem,
  type Split,
  type Tone,
} from '../../ui/design';
import type { ActivityKind, ManualVerdict, RunVerdict, Severity, StepState } from './types';

/**
 * Where the app's states meet the design system's tones. Every state ships a
 * label, and the ones drawn as a mark ship a glyph too, so nothing here is
 * carried by colour on its own.
 */
export const verdictTone: Record<RunVerdict, { tone: Tone; glyph: string; label: string }> = {
  passed: { tone: 'good', glyph: '✓', label: 'Passed' },
  failed: { tone: 'critical', glyph: '✕', label: 'Failed' },
  flaky: { tone: 'warning', glyph: '~', label: 'Flaky' },
  skipped: { tone: 'neutral', glyph: '–', label: 'Skipped' },
};

export const severityTone: Record<Severity, { tone: Tone; label: string }> = {
  critical: { tone: 'critical', label: 'Critical' },
  serious: { tone: 'serious', label: 'Serious' },
  warning: { tone: 'warning', label: 'Warning' },
};

export const activityTone: Record<ActivityKind, { icon: IconName; tone: Tone; label: string }> = {
  added: { icon: 'plus', tone: 'good', label: 'Added' },
  updated: { icon: 'pencil', tone: 'warning', label: 'Updated' },
  recorded: { icon: 'play', tone: 'accent', label: 'Recorded' },
  fixed: { icon: 'check', tone: 'good', label: 'Fixed' },
};

export const manualTone: Record<ManualVerdict, { tone: Tone; label: string }> = {
  pass: { tone: 'good', label: 'Pass' },
  fail: { tone: 'critical', label: 'Fail' },
  block: { tone: 'warning', label: 'Blocked' },
};

/** Series definition shared by the runs chart, its legend and its tooltip. */
export const runSeries: LegendItem[] = (['failed', 'skipped', 'passed'] as const).map((state) => ({
  id: state,
  label: verdictTone[state].label,
  color: chartFill[state],
}));

/** Legend order reads best worst-last; stacking order is the reverse. */
export const runLegend: LegendItem[] = [...runSeries].reverse();

/**
 * The run ribbon is a large fill, so it uses the calmer chart steps — except
 * for flaky, which has no chart step and keeps its status amber.
 */
export const ribbonColor = (verdict: RunVerdict) =>
  verdict === 'flaky' ? 'var(--ui-warning)' : chartFill[verdict as StepState];

/** A suite's pass/skip/fail mix, ready for <SplitBar>. Status hues, not chart
 *  hues: these bars are a few pixels tall, where the calmer steps disappear. */
export const healthSplits = (counts: Record<StepState, number>): Split[] =>
  (['passed', 'skipped', 'failed'] as const).map((state) => ({
    id: state,
    value: counts[state],
    color: toneFill[verdictTone[state].tone],
    label: verdictTone[state].label,
  }));
