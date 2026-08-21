export const APP_CHANNELS = {
  command: 'testron:app-command',
  snapshot: 'testron:snapshot',
} as const;

/**
 * The record screen's panels run in their own views, so their traffic is
 * relayed rather than handled: `state` goes down to the panels, `event` comes
 * back up to the screen. Neither channel accepts anything from the website
 * view — main checks the sender on both.
 */
export const RECORD_CHANNELS = {
  state: 'testron:record-state',
  event: 'testron:record-event',
} as const;

export const RECORDER_CHANNEL = 'testron:recorder-candidate' as const;
export const RECORDER_CONFIG_CHANNEL = 'testron:recorder-config' as const;

export const REMOTE_APP_CHANNELS = {
  command: 'testron:remote-command',
} as const;

export const APP_RENDERER_WEB_PREFERENCES = {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
} as const;

export const TESTED_WEBSITE_WEB_PREFERENCES = {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
} as const;
