import { describe, expect, it } from 'vitest';

import {
  APP_CHANNELS,
  APP_RENDERER_WEB_PREFERENCES,
  RECORDER_CHANNEL,
  TESTED_WEBSITE_WEB_PREFERENCES,
} from '../../src/main/security';

describe('Electron trust zones', () => {
  it.each([
    ['app renderer', APP_RENDERER_WEB_PREFERENCES],
    ['tested website', TESTED_WEBSITE_WEB_PREFERENCES],
  ])('locks down the %s process preferences', (_name, preferences) => {
    expect(preferences).toMatchObject({
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    });
  });

  it('keeps the embedded tested website under Chromium web security', () => {
    expect(TESTED_WEBSITE_WEB_PREFERENCES).toMatchObject({
      webSecurity: true,
      allowRunningInsecureContent: false,
    });
  });

  it('uses fixed IPC channels rather than page-selected operations', () => {
    expect(RECORDER_CHANNEL).toBe('testron:recorder-candidate');
    expect(Object.values(APP_CHANNELS)).toEqual([
      'testron:app-command',
      'testron:locale',
      'testron:snapshot',
      'testron:session-menu-selection',
      'testron:target-url',
    ]);
    expect(new Set([RECORDER_CHANNEL, ...Object.values(APP_CHANNELS)]).size).toBe(6);
  });
});
