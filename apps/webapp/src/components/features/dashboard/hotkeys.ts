import { formatForDisplay, type UseHotkeyDefinition } from '@tanstack/react-hotkeys';

import type { ManualVerdict, View } from './types';

export type ShortcutId =
  | 'jump'
  | 'nextFailure'
  | 'previousFailure'
  | 'nextEvidence'
  | 'previousEvidence'
  | 'filter'
  | 'closeFilter'
  | 'overview'
  | 'triage'
  | 'runs'
  | 'rerun'
  | 'quarantine'
  | 'bug'
  | 'pass'
  | 'fail'
  | 'block';

type Shortcut = {
  hotkeys: UseHotkeyDefinition['hotkey'][];
  name: string;
  description: string;
};

export const dashboardShortcuts = {
  jump: {
    hotkeys: ['Mod+K'],
    name: 'Jump to',
    description: 'Search dashboard destinations',
  },
  nextFailure: {
    hotkeys: ['J', 'ArrowDown'],
    name: 'Next failure',
    description: 'Move down the triage queue',
  },
  previousFailure: {
    hotkeys: ['K', 'ArrowUp'],
    name: 'Previous failure',
    description: 'Move up the triage queue',
  },
  previousEvidence: {
    hotkeys: ['['],
    name: 'Previous evidence tab',
    description: 'Show the previous evidence tab',
  },
  nextEvidence: {
    hotkeys: [']'],
    name: 'Next evidence tab',
    description: 'Show the next evidence tab',
  },
  filter: {
    hotkeys: ['/'],
    name: 'Filter failures',
    description: 'Focus the failure filter',
  },
  closeFilter: {
    hotkeys: ['Escape'],
    name: 'Close failure filter',
    description: 'Clear and close the failure filter',
  },
  overview: { hotkeys: ['O'], name: 'Overview', description: 'Open project overview' },
  triage: { hotkeys: ['T'], name: 'Triage', description: 'Open failure triage' },
  runs: { hotkeys: ['H'], name: 'Run history', description: 'Open run history' },
  rerun: { hotkeys: ['R'], name: 'Re-run', description: 'Re-run the selected failure' },
  quarantine: {
    hotkeys: ['Q'],
    name: 'Quarantine',
    description: 'Toggle quarantine for the selected failure',
  },
  bug: { hotkeys: ['B'], name: 'File bug', description: 'Draft a bug for the selected failure' },
  pass: { hotkeys: ['P'], name: 'Pass step', description: 'Mark the manual step passed' },
  fail: { hotkeys: ['F'], name: 'Fail step', description: 'Mark the manual step failed' },
  block: { hotkeys: ['X'], name: 'Block step', description: 'Mark the manual step blocked' },
} satisfies Record<ShortcutId, Shortcut>;

export const dashboardShortcutGroups: Array<{
  shortcuts: ShortcutId[];
  description: string;
  separator?: string;
}> = [
  { shortcuts: ['nextFailure', 'previousFailure'], description: 'move through the queue' },
  { shortcuts: ['overview', 'triage'], description: 'overview · triage' },
  {
    shortcuts: ['previousEvidence', 'nextEvidence'],
    description: 'switch evidence tab',
  },
  { shortcuts: ['filter'], description: 'filter failures' },
  {
    shortcuts: ['rerun', 'quarantine', 'bug'],
    description: 're-run · quarantine · bug',
    separator: ' · ',
  },
  {
    shortcuts: ['pass', 'fail', 'block'],
    description: 'manual verdict',
    separator: ' · ',
  },
];

export const displayShortcut = (id: ShortcutId): string =>
  formatForDisplay(dashboardShortcuts[id].hotkeys[0]!);

export const triageShortcutIds = {
  r: 'rerun',
  q: 'quarantine',
  b: 'bug',
} as const satisfies Record<'r' | 'q' | 'b', ShortcutId>;

export const manualShortcutIds = {
  pass: 'pass',
  fail: 'fail',
  block: 'block',
} as const satisfies Record<ManualVerdict, ShortcutId>;

export const displayShortcutGroup = ({
  shortcuts,
  separator = ' / ',
}: (typeof dashboardShortcutGroups)[number]): string =>
  shortcuts.map(displayShortcut).join(separator);

export type DashboardHotkeyActions = {
  toggleJump(): void;
  moveFailure(direction: -1 | 1): void;
  moveEvidence(direction: -1 | 1): void;
  openFilter(): void;
  closeFilter(): void;
  openView(view: View): void;
  runAction(action: 'r' | 'q' | 'b'): void;
  manualVerdict(verdict: ManualVerdict): void;
};

const dialogOpen = (jumpDialogAllowed: boolean): boolean => {
  if (typeof document === 'undefined') return false;
  return [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')].some(
    (dialog) => !jumpDialogAllowed || dialog.dataset.jumpTo !== 'true',
  );
};

const guarded =
  (callback: () => void, jumpDialogAllowed = false) =>
  () => {
    if (!dialogOpen(jumpDialogAllowed)) callback();
  };

export const createDashboardHotkeyDefinitions = (
  actions: DashboardHotkeyActions,
  options: {
    navigationEnabled: boolean;
    jumpEnabled: boolean;
    filterOpen: boolean;
    manualEnabled: boolean;
  },
): UseHotkeyDefinition[] => {
  const definition = (
    id: ShortcutId,
    callback: () => void,
    enabled = options.navigationEnabled,
    jumpDialogAllowed = false,
  ): UseHotkeyDefinition[] =>
    dashboardShortcuts[id].hotkeys.map((hotkey) => ({
      hotkey,
      callback: guarded(callback, jumpDialogAllowed),
      options: {
        enabled,
        ignoreInputs: id === 'jump' || id === 'closeFilter' ? false : true,
        meta: {
          name: dashboardShortcuts[id].name,
          description: dashboardShortcuts[id].description,
        },
      },
    }));

  return [
    ...definition('jump', actions.toggleJump, options.jumpEnabled, true),
    ...definition('nextFailure', () => actions.moveFailure(1)),
    ...definition('previousFailure', () => actions.moveFailure(-1)),
    ...definition('nextEvidence', () => actions.moveEvidence(1)),
    ...definition('previousEvidence', () => actions.moveEvidence(-1)),
    ...definition('filter', actions.openFilter),
    ...definition('closeFilter', actions.closeFilter, options.filterOpen),
    ...definition('overview', () => actions.openView('overview')),
    ...definition('triage', () => actions.openView('triage')),
    ...definition('runs', () => actions.openView('runs')),
    ...definition('rerun', () => actions.runAction('r')),
    ...definition('quarantine', () => actions.runAction('q')),
    ...definition('bug', () => actions.runAction('b')),
    ...definition('pass', () => actions.manualVerdict('pass'), options.manualEnabled),
    ...definition('fail', () => actions.manualVerdict('fail'), options.manualEnabled),
    ...definition('block', () => actions.manualVerdict('block'), options.manualEnabled),
  ];
};
