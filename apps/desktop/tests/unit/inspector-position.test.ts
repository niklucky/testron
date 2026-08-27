import { describe, expect, it } from 'vitest';

import { inspectorPosition } from '../../src/preload/inspector-position';

const viewport = { width: 800, height: 600 };
const inspector = { width: 300, height: 32 };

describe('inspectorPosition', () => {
  it('places the inspector above the target when there is room', () => {
    expect(
      inspectorPosition(
        { left: 200, top: 200, bottom: 240, width: 100, height: 40 },
        inspector,
        viewport,
      ),
    ).toEqual({ left: 200, top: 164 });
  });

  it('moves below a target near the top edge', () => {
    expect(
      inspectorPosition(
        { left: 200, top: 8, bottom: 48, width: 100, height: 40 },
        inspector,
        viewport,
      ),
    ).toEqual({ left: 200, top: 52 });
  });

  it('moves above a target near the bottom edge', () => {
    expect(
      inspectorPosition(
        { left: 200, top: 560, bottom: 596, width: 100, height: 36 },
        inspector,
        viewport,
      ),
    ).toEqual({ left: 200, top: 524 });
  });

  it('keeps the inspector inside the left and right edges', () => {
    expect(
      inspectorPosition(
        { left: -20, top: 200, bottom: 240, width: 100, height: 40 },
        inspector,
        viewport,
      ).left,
    ).toBe(4);
    expect(
      inspectorPosition(
        { left: 760, top: 200, bottom: 240, width: 100, height: 40 },
        inspector,
        viewport,
      ).left,
    ).toBe(496);
  });

  it('keeps the inspector inside the bottom edge when neither side fully fits', () => {
    expect(
      inspectorPosition(
        { left: 200, top: 20, bottom: 580, width: 100, height: 560 },
        { width: 300, height: 590 },
        viewport,
      ).top,
    ).toBe(6);
  });
});
