export const APP_CHANNELS = {
  command: 'testron:app-command',
  snapshot: 'testron:snapshot',
} as const;

export const RECORDER_CHANNEL = 'testron:recorder-candidate' as const;
export const RECORDER_CONFIG_CHANNEL = 'testron:recorder-config' as const;

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
