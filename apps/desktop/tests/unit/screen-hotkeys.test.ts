import { describe, expect, it, vi } from 'vitest';

import {
  createRecordHotkeyDefinitions,
  recordShortcutIdForKey,
  type RecordHotkeyActions,
} from '../../src/renderer/record/hotkeys';

const trigger = (entries: ReturnType<typeof createRecordHotkeyDefinitions>, hotkey: string) => {
  const entry = entries.find((candidate) => candidate.hotkey === hotkey);
  expect(entry, `Missing ${hotkey} hotkey`).toBeDefined();
  entry!.callback({} as KeyboardEvent, {} as never);
};

describe('record screen hotkeys', () => {
  it('routes recorder controls and preserves explicit input behavior', () => {
    const actions: RecordHotkeyActions = {
      focusAddress: vi.fn(),
      toggleRecording: vi.fn(),
      toggleAssert: vi.fn(),
      toggleHover: vi.fn(),
      toggleStepsPanel: vi.fn(),
      toggleCodePanel: vi.fn(),
      toggleFocus: vi.fn(),
      escape: vi.fn(),
    };
    const entries = createRecordHotkeyDefinitions(actions, {
      enabled: true,
      captureModeEnabled: true,
      escapeEnabled: true,
    });

    trigger(entries, 'Mod+L');
    trigger(entries, 'R');
    trigger(entries, 'A');
    trigger(entries, 'H');
    trigger(entries, '1');

    expect(actions.focusAddress).toHaveBeenCalledOnce();
    expect(actions.toggleRecording).toHaveBeenCalledOnce();
    expect(actions.toggleAssert).toHaveBeenCalledOnce();
    expect(actions.toggleHover).toHaveBeenCalledOnce();
    expect(actions.toggleStepsPanel).toHaveBeenCalledOnce();
    expect(entries.find((entry) => entry.hotkey === 'R')?.options?.ignoreInputs).toBe(true);
    expect(entries.find((entry) => entry.hotkey === 'Mod+L')?.options?.ignoreInputs).toBe(false);
    expect(recordShortcutIdForKey('R')).toBe('record');
    expect(recordShortcutIdForKey('h')).toBe('hover');
  });

  it('only enables explicit capture modes while recording', () => {
    const entries = createRecordHotkeyDefinitions({} as RecordHotkeyActions, {
      enabled: true,
      captureModeEnabled: false,
      escapeEnabled: true,
    });

    expect(entries.find((entry) => entry.hotkey === 'A')?.options?.enabled).toBe(false);
    expect(entries.find((entry) => entry.hotkey === 'H')?.options?.enabled).toBe(false);
    expect(entries.find((entry) => entry.hotkey === 'R')?.options?.enabled).toBe(true);
  });
});
