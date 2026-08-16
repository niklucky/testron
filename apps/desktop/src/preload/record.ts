import { z } from 'zod';

/**
 * The contract between the record screen and its two panel views.
 *
 * The panels are their own WebContentsViews stacked over the website view, so
 * they are separate renderer processes: everything they show arrives as state
 * on one channel, and everything they do leaves as an event on another. The
 * main process only relays and lays out — it never interprets.
 *
 * Schemas live here rather than in main because both ends need the same
 * shape; the renderer imports the inferred types with `import type`, which
 * keeps zod out of the renderer bundle.
 */

export const panelIdSchema = z.enum(['steps', 'code']);
export type PanelId = z.infer<typeof panelIdSchema>;

const rectSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
});
export type Rect = z.infer<typeof rectSchema>;

/** A panel's share of the window, as a percentage of its width. */
const panelLayoutSchema = z.object({
  visible: z.boolean(),
  width: z.number().min(10).max(60),
});
export type PanelLayout = z.infer<typeof panelLayoutSchema>;

export const recordLayoutSchema = z.object({
  /**
   * The rectangle the website view fills, in window coordinates. `null` when
   * the record screen is not mounted — everything is parked off-window.
   */
  plane: rectSchema.nullable(),
  panels: z.object({ steps: panelLayoutSchema, code: panelLayoutSchema }),
  /**
   * The panel currently being dragged. Its view is widened to the whole plane
   * for the duration so the pointer cannot escape into the website view
   * mid-drag — a transparent view still receives the events.
   */
  resizing: panelIdSchema.nullable(),
});
export type RecordLayout = z.infer<typeof recordLayoutSchema>;

export const recordedStepSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    'navigate',
    'click',
    'fill',
    'select',
    'check',
    'uncheck',
    'press',
    'assert',
    'assertUrl',
  ]),
  label: z.string(),
  locator: z.string(),
  alternatives: z.array(z.string()),
  spot: z.string().optional(),
  value: z.string().optional(),
  secret: z.string().optional(),
  url: z.string().optional(),
  assertion: z
    .enum([
      'visible',
      'hidden',
      'textContains',
      'textEquals',
      'value',
      'enabled',
      'disabled',
      'checked',
      'unchecked',
    ])
    .optional(),
  warning: z.string().optional(),
  at: z.number().nonnegative(),
});
export type RecordedStep = z.infer<typeof recordedStepSchema>;

export const recordPanelStateSchema = z.object({
  theme: z.enum(['dark', 'light']),
  status: z.enum(['idle', 'recording', 'paused', 'finished']),
  mode: z.enum(['act', 'assert']),
  elapsed: z.number().nonnegative(),
  file: z.string(),
  selectedId: z.string().optional(),
  expandedId: z.string().optional(),
  steps: z.array(recordedStepSchema).max(2_000),
  lines: z.array(z.object({ text: z.string(), stepId: z.string().optional() })).max(10_000),
  layout: recordLayoutSchema,
});
export type RecordPanelState = z.infer<typeof recordPanelStateSchema>;

export const recordPanelEventSchema = z.discriminatedUnion('type', [
  /** A panel finished loading and has nothing to show yet. */
  z.object({ type: z.literal('ready'), panel: panelIdSchema }),
  z.object({ type: z.literal('select'), id: z.string().min(1) }),
  z.object({ type: z.literal('expand'), id: z.string().min(1) }),
  z.object({ type: z.literal('use-alternative'), id: z.string().min(1), locator: z.string() }),
  z.object({ type: z.literal('delete'), id: z.string().min(1) }),
  z.object({ type: z.literal('close'), panel: panelIdSchema }),
  z.object({
    type: z.literal('resize'),
    panel: panelIdSchema,
    width: z.number().min(10).max(60),
    /** False while dragging, true on release — the view goes back to panel size. */
    done: z.boolean(),
  }),
  z.object({ type: z.literal('copy') }),
  /** A record shortcut typed while a panel had focus, forwarded to the screen. */
  z.object({ type: z.literal('shortcut'), key: z.string().min(1).max(2) }),
]);
export type RecordPanelEvent = z.infer<typeof recordPanelEventSchema>;
