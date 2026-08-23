export const APP_CHANNELS = {
  command: 'testron:app-command',
  locale: 'testron:locale',
  snapshot: 'testron:snapshot',
  sessionMenuSelection: 'testron:session-menu-selection',
  targetUrl: 'testron:target-url',
} as const;

/** Narrow recorder UI channels; `event` also carries tested-page shortcuts. */
export const RECORD_CHANNELS = {
  state: 'testron:record-state',
  event: 'testron:record-event',
} as const;

export const RECORDER_CHANNEL = 'testron:recorder-candidate' as const;
export const RECORDER_CONFIG_CHANNEL = 'testron:recorder-config' as const;

export const REMOTE_APP_CHANNELS = {
  command: 'testron:remote-command',
  runtimeState: 'testron:remote-runtime-state',
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
  webSecurity: true,
  allowRunningInsecureContent: false,
} as const;
