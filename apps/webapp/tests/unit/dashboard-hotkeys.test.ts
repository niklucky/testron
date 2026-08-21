import { describe, expect, it, vi } from 'vitest';

import {
  createDashboardHotkeyDefinitions,
  dashboardShortcutGroups,
  dashboardShortcuts,
  type DashboardHotkeyActions,
} from '../../src/components/features/dashboard/hotkeys';

const actions = (): DashboardHotkeyActions => ({
  toggleJump: vi.fn(),
  moveFailure: vi.fn(),
  moveEvidence: vi.fn(),
  openFilter: vi.fn(),
  closeFilter: vi.fn(),
  openView: vi.fn(),
  runAction: vi.fn(),
  manualVerdict: vi.fn(),
});

const definitions = (hotkeyActions: DashboardHotkeyActions, manualEnabled = true) =>
  createDashboardHotkeyDefinitions(hotkeyActions, {
    navigationEnabled: true,
    jumpEnabled: true,
    filterOpen: true,
    manualEnabled,
  });

const trigger = (entries: ReturnType<typeof definitions>, hotkey: string) => {
  const entry = entries.find((candidate) => candidate.hotkey === hotkey);
  expect(entry, `Missing ${hotkey} hotkey`).toBeDefined();
  entry!.callback({} as KeyboardEvent, {} as never);
};

describe('dashboard hotkeys', () => {
  it('routes representative registered shortcuts to their real actions', () => {
    const hotkeyActions = actions();
    const entries = definitions(hotkeyActions);

    trigger(entries, 'J');
    trigger(entries, ']');
    trigger(entries, '/');
    trigger(entries, 'P');

    expect(hotkeyActions.moveFailure).toHaveBeenCalledWith(1);
    expect(hotkeyActions.moveEvidence).toHaveBeenCalledWith(1);
    expect(hotkeyActions.openFilter).toHaveBeenCalledOnce();
    expect(hotkeyActions.manualVerdict).toHaveBeenCalledWith('pass');
  });

  it('guards typing while keeping the command palette and filter Escape intentional', () => {
    const entries = definitions(actions());

    for (const entry of entries) {
      const intentionalInInput = entry.hotkey === 'Mod+K' || entry.hotkey === 'Escape';
      expect(entry.options?.ignoreInputs).toBe(!intentionalInInput);
    }
  });

  it('disables manual verdicts outside the active manual evidence tab', () => {
    const entries = definitions(actions(), false);

    for (const hotkey of ['P', 'F', 'X']) {
      expect(entries.find((entry) => entry.hotkey === hotkey)?.options?.enabled).toBe(false);
    }
    expect(entries.find((entry) => entry.hotkey === 'J')?.options?.enabled).toBe(true);
  });

  it('builds every context-rail hint from registered shortcut metadata', () => {
    const displayedIds = dashboardShortcutGroups.flatMap((group) => group.shortcuts);

    expect(displayedIds).toEqual(
      expect.arrayContaining([
        'nextFailure',
        'previousFailure',
        'previousEvidence',
        'nextEvidence',
        'rerun',
        'quarantine',
        'bug',
        'pass',
        'fail',
        'block',
      ]),
    );
    for (const id of displayedIds) expect(dashboardShortcuts[id].hotkeys.length).toBeGreaterThan(0);
  });
});
