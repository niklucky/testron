import { describe, expect, it } from 'vitest';

import {
  authenticationStateIsStale,
  deriveAuthenticationStateExpiration,
} from '../../src/auth/storage-state';

const jwt = (exp: number): string =>
  `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.signature`;

describe('authentication storage-state expiry', () => {
  it('uses the earliest cookie, nested JWT, or maximum-age expiration', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const expiration = deriveAuthenticationStateExpiration(
      {
        cookies: [{ value: 'session', expires: Date.parse('2026-01-01T03:00:00Z') / 1_000 }],
        origins: [
          {
            localStorage: [
              {
                value: JSON.stringify({
                  token: jwt(Date.parse('2026-01-01T02:00:00Z') / 1_000),
                }),
              },
            ],
          },
        ],
      },
      createdAt,
      12 * 60 * 60,
    );
    expect(expiration.toISOString()).toBe('2026-01-01T02:00:00.000Z');
  });

  it('refreshes inside the configured lead time', () => {
    expect(
      authenticationStateIsStale(
        new Date('2026-01-01T02:00:00.000Z'),
        15 * 60,
        new Date('2026-01-01T01:50:00.000Z'),
      ),
    ).toBe(true);
  });

  it('ignores expiration values that predate state creation', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const expiration = deriveAuthenticationStateExpiration(
      {
        cookies: [
          { value: jwt(Date.parse('2025-12-31T22:00:00Z') / 1_000), expires: 1_700_000_000 },
        ],
        origins: [],
      },
      createdAt,
      60 * 60,
    );
    expect(expiration.toISOString()).toBe('2026-01-01T01:00:00.000Z');
  });
});
