import { describe, expect, it } from 'vitest';

import { authenticationSurface } from '../../src/renderer/auth/access';

describe('desktop authentication boundary', () => {
  it('waits for the main-process snapshot before choosing a surface', () => {
    expect(authenticationSurface(false, undefined)).toBe('loading');
  });

  it('gates ordinary unconfigured and configured signed-out processes', () => {
    expect(
      authenticationSurface(true, {
        configured: false,
        authentication: 'signedOut',
        workspace: 'loading',
        status: 'idle',
      }),
    ).toBe('landing');
    expect(
      authenticationSurface(true, {
        configured: true,
        authentication: 'signedOut',
        workspace: 'loading',
        status: 'idle',
      }),
    ).toBe('landing');
    expect(
      authenticationSurface(true, {
        configured: true,
        authentication: 'authenticating',
        workspace: 'loading',
        status: 'idle',
      }),
    ).toBe('landing');
  });

  it('opens product routes after remote authorization or explicit local-mode sign-in', () => {
    expect(
      authenticationSurface(true, {
        configured: true,
        authentication: 'signedIn',
        workspace: 'loaded',
        status: 'synced',
      }),
    ).toBe('product');
    expect(
      authenticationSurface(true, {
        configured: false,
        authentication: 'signedIn',
        workspace: 'loaded',
        status: 'idle',
      }),
    ).toBe('product');
  });
});
