import { describe, expect, it } from 'vitest';

import { isUnauthorizedError } from '../../src/lib/workspace';

describe('workspace authentication errors', () => {
  it('redirects only for an explicit unauthorized tRPC response', () => {
    expect(isUnauthorizedError({ data: { code: 'UNAUTHORIZED' } })).toBe(true);
    expect(isUnauthorizedError({ data: { code: 'INTERNAL_SERVER_ERROR' } })).toBe(false);
    expect(isUnauthorizedError(new Error('network unavailable'))).toBe(false);
  });
});
