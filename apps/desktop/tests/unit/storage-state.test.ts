import { describe, expect, it } from 'vitest';

import {
  parseBrowserStorageState,
  safeParseBrowserStorageState,
} from '../../src/main/profiles/storage-state';

describe('browser storage-state parsing', () => {
  it('parses valid Playwright storage state', () => {
    expect(parseBrowserStorageState('{"cookies":[],"origins":[]}')).toEqual({
      cookies: [],
      origins: [],
    });
  });

  it('returns a warning instead of throwing for recorder profile application', () => {
    const parsed = safeParseBrowserStorageState('{not json');

    expect(parsed.state).toBeUndefined();
    expect(parsed.error).toContain('Saved browser storage state is invalid');
  });
});
