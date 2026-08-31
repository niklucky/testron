import { describe, expect, it } from 'vitest';

import { fitWindowBounds, parseWindowState, type WindowState } from '../../src/main/window-state';

const savedState: WindowState = {
  bounds: { x: 2100, y: 120, width: 1280, height: 900 },
  displayId: 2,
  displayWorkArea: { x: 1920, y: 0, width: 1920, height: 1080 },
  isMaximized: false,
};

describe('window state', () => {
  it('keeps the window position relative to its remembered display', () => {
    expect(
      fitWindowBounds(
        savedState,
        { x: -2560, y: 0, width: 2560, height: 1440 },
        {
          width: 880,
          height: 640,
        },
      ),
    ).toEqual({ x: -2380, y: 120, width: 1280, height: 900 });
  });

  it('clamps restored bounds into a smaller work area', () => {
    expect(
      fitWindowBounds(
        savedState,
        { x: 0, y: 0, width: 1024, height: 768 },
        {
          width: 880,
          height: 640,
        },
      ),
    ).toEqual({ x: 0, y: 0, width: 1024, height: 768 });
  });

  it('ignores malformed persisted state', () => {
    expect(parseWindowState({ bounds: { x: 0 } })).toBeUndefined();
    expect(parseWindowState({ ...savedState, isMaximized: 'yes' })).toBeUndefined();
  });
});
