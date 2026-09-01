export type InspectorRect = {
  left: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};

export type ViewportSize = { width: number; height: number };

export type InspectorAnchor = { x: number; y: number };

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

/** Position a measured inspector beside the pointer while keeping every edge inside the viewport. */
export const inspectorPosition = (
  anchor: InspectorAnchor,
  inspector: Pick<InspectorRect, 'width' | 'height'>,
  viewport: ViewportSize,
  margin = 8,
  gap = 12,
): { left: number; top: number } => {
  const maximumLeft = Math.max(margin, viewport.width - inspector.width - margin);
  const maximumTop = Math.max(margin, viewport.height - inspector.height - margin);
  const right = anchor.x + gap;
  const left = anchor.x - inspector.width - gap;
  const below = anchor.y + gap;
  const above = anchor.y - inspector.height - gap;
  const preferredLeft = right <= maximumLeft || left < margin ? right : left;
  const preferredTop = below <= maximumTop || above < margin ? below : above;

  return {
    left: Math.round(clamp(preferredLeft, margin, maximumLeft)),
    top: Math.round(clamp(preferredTop, margin, maximumTop)),
  };
};
