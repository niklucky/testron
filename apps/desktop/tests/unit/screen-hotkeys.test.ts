import { describe, expect, it, vi } from 'vitest';

import {
  createRecordHotkeyDefinitions,
  recordShortcutIdForKey,
  type RecordHotkeyActions,
} from '../../src/renderer/record/hotkeys';
import {
  createTestViewHotkeyDefinitions,
  type TestViewHotkeyActions,
} from '../../src/renderer/test-view/hotkeys';

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
      toggleStepsPanel: vi.fn(),
      toggleCodePanel: vi.fn(),
      toggleFocus: vi.fn(),
      escape: vi.fn(),
    };
    const entries = createRecordHotkeyDefinitions(actions, {
      enabled: true,
      assertEnabled: true,
      escapeEnabled: true,
    });

    trigger(entries, 'Mod+L');
    trigger(entries, 'R');
    trigger(entries, 'A');
    trigger(entries, '1');

    expect(actions.focusAddress).toHaveBeenCalledOnce();
    expect(actions.toggleRecording).toHaveBeenCalledOnce();
    expect(actions.toggleAssert).toHaveBeenCalledOnce();
    expect(actions.toggleStepsPanel).toHaveBeenCalledOnce();
    expect(entries.find((entry) => entry.hotkey === 'R')?.options?.ignoreInputs).toBe(true);
    expect(entries.find((entry) => entry.hotkey === 'Mod+L')?.options?.ignoreInputs).toBe(false);
    expect(recordShortcutIdForKey('R')).toBe('record');
  });

  it('only enables assertion mode while recording', () => {
    const entries = createRecordHotkeyDefinitions({} as RecordHotkeyActions, {
      enabled: true,
      assertEnabled: false,
      escapeEnabled: true,
    });

    expect(entries.find((entry) => entry.hotkey === 'A')?.options?.enabled).toBe(false);
    expect(entries.find((entry) => entry.hotkey === 'R')?.options?.enabled).toBe(true);
  });
});

describe('test view hotkeys', () => {
  it('routes run, source, edit, and modal Escape actions', () => {
    const actions: TestViewHotkeyActions = {
      run: vi.fn(),
      toggleSource: vi.fn(),
      edit: vi.fn(),
      closeSource: vi.fn(),
    };
    const entries = createTestViewHotkeyDefinitions(actions, {
      enabled: true,
      runEnabled: true,
      sourceEnabled: true,
      closeSource: true,
    });

    for (const hotkey of ['R', 'S', 'E', 'Escape']) trigger(entries, hotkey);

    expect(actions.run).toHaveBeenCalledOnce();
    expect(actions.toggleSource).toHaveBeenCalledOnce();
    expect(actions.edit).toHaveBeenCalledOnce();
    expect(actions.closeSource).toHaveBeenCalledOnce();
    expect(entries.find((entry) => entry.hotkey === 'S')?.options?.ignoreInputs).toBe(true);
    expect(entries.find((entry) => entry.hotkey === 'Escape')?.options?.ignoreInputs).toBe(false);
  });

  it('disables run without steps and navigation behind the source modal', () => {
    const entries = createTestViewHotkeyDefinitions({} as TestViewHotkeyActions, {
      enabled: false,
      runEnabled: false,
      sourceEnabled: true,
      closeSource: true,
    });

    expect(entries.find((entry) => entry.hotkey === 'R')?.options?.enabled).toBe(false);
    expect(entries.find((entry) => entry.hotkey === 'E')?.options?.enabled).toBe(false);
    expect(entries.find((entry) => entry.hotkey === 'S')?.options?.enabled).toBe(true);
    expect(entries.find((entry) => entry.hotkey === 'Escape')?.options?.enabled).toBe(true);
  });
});
