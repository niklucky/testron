/**
 * Tone is the design system's colour vocabulary. Components take a tone, not a
 * colour, so a status can be restyled in one place and stay consistent across
 * dots, badges, bars and charts.
 *
 * Three roles per tone, and they are not interchangeable:
 *
 *   fill  a shape the eye reads as a mark — dots, bars, ribbon cells
 *   ink   the tone used as *text*; amber has to darken in light mode to stay
 *         readable, which is why this is a separate slot
 *   wash  a low-alpha background the ink is legible on
 *
 * Colour is never the only signal. Anything using a tone to mean something
 * ships a label, a glyph or a tooltip alongside it.
 */
export type Tone = 'accent' | 'good' | 'warning' | 'serious' | 'critical' | 'neutral';

export const toneFill: Record<Tone, string> = {
  accent: 'var(--ui-accent)',
  good: 'var(--ui-good)',
  warning: 'var(--ui-warning)',
  serious: 'var(--ui-serious)',
  critical: 'var(--ui-critical)',
  neutral: 'var(--ui-neutral)',
};

export const toneInk: Record<Tone, string> = {
  accent: 'var(--ui-accent)',
  good: 'var(--ui-good)',
  warning: 'var(--ui-warning-ink)',
  serious: 'var(--ui-serious)',
  critical: 'var(--ui-critical)',
  neutral: 'var(--ui-ink-3)',
};

export const toneWash: Record<Tone, string> = {
  accent: 'var(--ui-accent-wash)',
  good: 'var(--ui-good-wash)',
  warning: 'var(--ui-warning-wash)',
  serious: 'var(--ui-critical-wash)',
  critical: 'var(--ui-critical-wash)',
  neutral: 'var(--ui-line-soft)',
};

/** Text + background for a tinted chip, pill or callout. */
export const toneStyle = (tone: Tone) => ({
  color: toneInk[tone],
  background: toneWash[tone],
});

/**
 * Calmer steps of the same hues, for fills large enough that full saturation
 * would take over the panel: stacked bars, run ribbons, split meters.
 */
export const chartFill = {
  passed: 'var(--ui-chart-passed)',
  skipped: 'var(--ui-chart-skipped)',
  failed: 'var(--ui-chart-failed)',
} as const;

/** One hue, four ordinal steps. Index 0 is the lightest load. */
export const heatRamp = [
  'var(--ui-heat-1)',
  'var(--ui-heat-2)',
  'var(--ui-heat-3)',
  'var(--ui-heat-4)',
];

/** The "no data" cell in a heat map — a track, not a step in the ramp. */
export const heatEmpty = 'var(--ui-line-soft)';
