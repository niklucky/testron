export type InspectorRect = {
  left: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};

export type ViewportSize = { width: number; height: number };

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

/** Position a measured inspector near its target while keeping every edge inside the viewport. */
export const inspectorPosition = (
  target: InspectorRect,
  inspector: Pick<InspectorRect, 'width' | 'height'>,
  viewport: ViewportSize,
  margin = 4,
  gap = 4,
): { left: number; top: number } => {
  const maximumLeft = Math.max(margin, viewport.width - inspector.width - margin);
  const maximumTop = Math.max(margin, viewport.height - inspector.height - margin);
  const above = target.top - inspector.height - gap;
  const below = target.bottom + gap;
  const fitsAbove = above >= margin;
  const fitsBelow = below <= maximumTop;
  const availableAbove = target.top - gap - margin;
  const availableBelow = viewport.height - margin - target.bottom - gap;
  const preferredTop = fitsAbove
    ? above
    : fitsBelow || availableBelow >= availableAbove
      ? below
      : above;

  return {
    left: Math.round(clamp(target.left, margin, maximumLeft)),
    top: Math.round(clamp(preferredTop, margin, maximumTop)),
  };
};
