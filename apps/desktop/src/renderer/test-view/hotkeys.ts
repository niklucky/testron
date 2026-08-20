import { formatForDisplay, type UseHotkeyDefinition } from '@tanstack/react-hotkeys';

export type TestViewShortcutId = 'run' | 'source' | 'edit' | 'closeSource';

export const testViewShortcuts = {
  run: { hotkey: 'R', name: 'Run test', description: 'Run or cancel the selected test' },
  source: { hotkey: 'S', name: 'View source', description: 'Toggle generated test source' },
  edit: { hotkey: 'E', name: 'Edit test', description: 'Open the selected test in the recorder' },
  closeSource: {
    hotkey: 'Escape',
    name: 'Close source',
    description: 'Close the source dialog',
  },
} as const satisfies Record<
  TestViewShortcutId,
  { hotkey: UseHotkeyDefinition['hotkey']; name: string; description: string }
>;

export const displayTestViewShortcut = (id: TestViewShortcutId): string =>
  formatForDisplay(testViewShortcuts[id].hotkey);

export type TestViewHotkeyActions = {
  run(): void;
  toggleSource(): void;
  edit(): void;
  closeSource(): void;
};

export const createTestViewHotkeyDefinitions = (
  actions: TestViewHotkeyActions,
  options: { enabled: boolean; runEnabled: boolean; sourceEnabled: boolean; closeSource: boolean },
): UseHotkeyDefinition[] => {
  const actionById: Record<TestViewShortcutId, () => void> = {
    run: actions.run,
    source: actions.toggleSource,
    edit: actions.edit,
    closeSource: actions.closeSource,
  };

  return (Object.keys(testViewShortcuts) as TestViewShortcutId[]).map((id) => ({
    hotkey: testViewShortcuts[id].hotkey,
    callback: actionById[id],
    options: {
      enabled:
        id === 'closeSource'
          ? options.closeSource
          : id === 'source'
            ? options.sourceEnabled
            : options.enabled && (id !== 'run' || options.runEnabled),
      ignoreInputs: id === 'closeSource' ? false : true,
      meta: {
        name: testViewShortcuts[id].name,
        description: testViewShortcuts[id].description,
      },
    },
  }));
};
