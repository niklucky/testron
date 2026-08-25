import { describe, expect, it } from 'vitest';

import { authenticationErrorMessage } from '../../src/components/features/auth/authentication';

describe('authentication feedback', () => {
  it('shows server and network error messages', () => {
    expect(authenticationErrorMessage(new Error('The email or password is incorrect.'))).toBe(
      'The email or password is incorrect.',
    );
    expect(authenticationErrorMessage('The server is unavailable.')).toBe(
      'The server is unavailable.',
    );
  });

  it('falls back when an authentication failure has no usable message', () => {
    expect(authenticationErrorMessage(undefined)).toBe('Authentication failed. Please try again.');
    expect(authenticationErrorMessage('   ')).toBe('Authentication failed. Please try again.');
  });
});
