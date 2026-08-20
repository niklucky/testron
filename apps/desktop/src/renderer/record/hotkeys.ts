import { formatForDisplay, type UseHotkeyDefinition } from '@tanstack/react-hotkeys';

export type RecordShortcutId =
  'address' | 'record' | 'assert' | 'stepsPanel' | 'codePanel' | 'focus' | 'escape';

export const recordShortcuts = {
  address: { hotkey: 'Mod+L', name: 'Address', description: 'Focus the browser address' },
  record: { hotkey: 'R', name: 'Record or pause', description: 'Toggle recording' },
  assert: { hotkey: 'A', name: 'Assert mode', description: 'Toggle assertion capture mode' },
  stepsPanel: { hotkey: '1', name: 'Test steps', description: 'Toggle the test steps panel' },
  codePanel: { hotkey: '2', name: 'Auto test', description: 'Toggle the source panel' },
  focus: { hotkey: 'F', name: 'Focus website', description: 'Toggle both recorder panels' },
  escape: { hotkey: 'Escape', name: 'Close or blur', description: 'Close the finish sheet' },
} as const satisfies Record<
  RecordShortcutId,
  { hotkey: UseHotkeyDefinition['hotkey']; name: string; description: string }
>;

export const recordPanelShortcutIds = [
  'record',
  'assert',
  'stepsPanel',
  'codePanel',
  'focus',
] as const satisfies RecordShortcutId[];

const recordForwardedShortcutIds = [
  'address',
  ...recordPanelShortcutIds,
] as const satisfies RecordShortcutId[];

export const displayRecordShortcut = (id: RecordShortcutId): string =>
  formatForDisplay(recordShortcuts[id].hotkey);

export type RecordHotkeyActions = {
  focusAddress(): void;
  toggleRecording(): void;
  toggleAssert(): void;
  toggleStepsPanel(): void;
  toggleCodePanel(): void;
  toggleFocus(): void;
  escape(event: KeyboardEvent): void;
};

export const runRecordShortcut = (
  id: RecordShortcutId,
  actions: RecordHotkeyActions,
  event?: KeyboardEvent,
) => {
  if (id === 'address') actions.focusAddress();
  else if (id === 'record') actions.toggleRecording();
  else if (id === 'assert') actions.toggleAssert();
  else if (id === 'stepsPanel') actions.toggleStepsPanel();
  else if (id === 'codePanel') actions.toggleCodePanel();
  else if (id === 'focus') actions.toggleFocus();
  else if (event) actions.escape(event);
};

export const createRecordHotkeyDefinitions = (
  actions: RecordHotkeyActions,
  options: { enabled: boolean; assertEnabled: boolean; escapeEnabled: boolean },
): UseHotkeyDefinition[] => {
  return (Object.keys(recordShortcuts) as RecordShortcutId[]).map((id) => ({
    hotkey: recordShortcuts[id].hotkey,
    callback: (event) => runRecordShortcut(id, actions, event),
    options: {
      enabled:
        id === 'escape'
          ? options.escapeEnabled
          : id === 'assert'
            ? options.enabled && options.assertEnabled
            : options.enabled,
      ignoreInputs: id === 'address' || id === 'escape' ? false : true,
      meta: { name: recordShortcuts[id].name, description: recordShortcuts[id].description },
    },
  }));
};

export const recordShortcutIdForKey = (key: string): RecordShortcutId | undefined => {
  const normalized = key.toLowerCase();
  return recordForwardedShortcutIds.find(
    (id) => String(recordShortcuts[id].hotkey).toLowerCase() === normalized,
  );
};
