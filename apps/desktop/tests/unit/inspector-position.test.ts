import { describe, expect, it } from 'vitest';

import { inspectorPosition } from '../../src/preload/inspector-position';

const viewport = { width: 800, height: 600 };
const inspector = { width: 300, height: 32 };

describe('inspectorPosition', () => {
  it('places the inspector below and to the right of the pointer when there is room', () => {
    expect(inspectorPosition({ x: 200, y: 200 }, inspector, viewport)).toEqual({
      left: 212,
      top: 212,
    });
  });

  it('moves to the left of a pointer near the right edge', () => {
    expect(inspectorPosition({ x: 790, y: 200 }, inspector, viewport)).toEqual({
      left: 478,
      top: 212,
    });
  });

  it('moves above a pointer near the bottom edge', () => {
    expect(inspectorPosition({ x: 200, y: 590 }, inspector, viewport)).toEqual({
      left: 212,
      top: 546,
    });
  });

  it('keeps the inspector inside every viewport edge', () => {
    expect(inspectorPosition({ x: -20, y: -20 }, inspector, viewport)).toEqual({
      left: 8,
      top: 8,
    });
    expect(inspectorPosition({ x: 820, y: 620 }, inspector, viewport)).toEqual({
      left: 492,
      top: 560,
    });
  });

  it('pins an inspector larger than the viewport to the margin', () => {
    expect(inspectorPosition({ x: 400, y: 300 }, { width: 900, height: 700 }, viewport)).toEqual({
      left: 8,
      top: 8,
    });
  });
});
