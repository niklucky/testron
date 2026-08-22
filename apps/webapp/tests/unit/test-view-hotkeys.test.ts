import { describe, expect, it, vi } from 'vitest';

import {
  createTestViewHotkeyDefinitions,
  type TestViewHotkeyActions,
} from '../../src/components/features/test-view/hotkeys';

const trigger = (entries: ReturnType<typeof createTestViewHotkeyDefinitions>, hotkey: string) => {
  const entry = entries.find((candidate) => candidate.hotkey === hotkey);
  expect(entry, `Missing ${hotkey} hotkey`).toBeDefined();
  entry!.callback({} as KeyboardEvent, {} as never);
};

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
