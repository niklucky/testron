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
    expect(preferences).toEqual({ nodeIntegration: false, contextIsolation: true, sandbox: true });
  });

  it('uses fixed IPC channels rather than page-selected operations', () => {
    expect(RECORDER_CHANNEL).toBe('testron:recorder-candidate');
    expect(Object.values(APP_CHANNELS)).toEqual(['testron:app-command', 'testron:snapshot']);
    expect(new Set([RECORDER_CHANNEL, ...Object.values(APP_CHANNELS)]).size).toBe(3);
  });
});
