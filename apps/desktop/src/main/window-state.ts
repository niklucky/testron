import { readFileSync, writeFileSync } from 'node:fs';

export interface WindowRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowState {
  bounds: WindowRectangle;
  displayId: number;
  displayWorkArea: WindowRectangle;
  isMaximized: boolean;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const rectangle = (value: unknown): WindowRectangle | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = value as Partial<WindowRectangle>;
  if (
    !isFiniteNumber(candidate.x) ||
    !isFiniteNumber(candidate.y) ||
    !isFiniteNumber(candidate.width) ||
    !isFiniteNumber(candidate.height) ||
    candidate.width <= 0 ||
    candidate.height <= 0
  )
    return undefined;
  return {
    x: Math.round(candidate.x),
    y: Math.round(candidate.y),
    width: Math.round(candidate.width),
    height: Math.round(candidate.height),
  };
};

export const parseWindowState = (value: unknown): WindowState | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = value as Partial<WindowState>;
  const bounds = rectangle(candidate.bounds);
  const displayWorkArea = rectangle(candidate.displayWorkArea);
  if (
    !bounds ||
    !displayWorkArea ||
    !isFiniteNumber(candidate.displayId) ||
    typeof candidate.isMaximized !== 'boolean'
  )
    return undefined;
  return {
    bounds,
    displayId: candidate.displayId,
    displayWorkArea,
    isMaximized: candidate.isMaximized,
  };
};

export const loadWindowState = (filePath: string): WindowState | undefined => {
  try {
    return parseWindowState(JSON.parse(readFileSync(filePath, 'utf8')));
  } catch {
    return undefined;
  }
};

export const saveWindowState = (filePath: string, state: WindowState): void => {
  writeFileSync(filePath, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 });
};

export const fitWindowBounds = (
  state: WindowState,
  targetWorkArea: WindowRectangle,
  minimumSize: { width: number; height: number },
): WindowRectangle => {
  const width = Math.min(Math.max(state.bounds.width, minimumSize.width), targetWorkArea.width);
  const height = Math.min(Math.max(state.bounds.height, minimumSize.height), targetWorkArea.height);
  const translatedX = targetWorkArea.x + (state.bounds.x - state.displayWorkArea.x);
  const translatedY = targetWorkArea.y + (state.bounds.y - state.displayWorkArea.y);
  return {
    x: Math.min(
      Math.max(translatedX, targetWorkArea.x),
      targetWorkArea.x + targetWorkArea.width - width,
    ),
    y: Math.min(
      Math.max(translatedY, targetWorkArea.y),
      targetWorkArea.y + targetWorkArea.height - height,
    ),
    width,
    height,
  };
};
