import { describe, expect, it } from 'vitest';

import { nextCronOccurrence, parseCronExpression } from '../../src/scheduling/cron';

describe('UTC cron expressions', () => {
  it('finds hourly and midnight preset occurrences', () => {
    const now = new Date('2026-08-31T00:12:45.000Z');
    expect(nextCronOccurrence('0 * * * *', now).toISOString()).toBe('2026-08-31T01:00:00.000Z');
    expect(nextCronOccurrence('0 0 * * *', now).toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('supports lists, ranges, steps and Sunday aliases', () => {
    expect(
      nextCronOccurrence('*/15 8-9 * * 1,7', new Date('2026-08-30T09:01:00.000Z')).toISOString(),
    ).toBe('2026-08-30T09:15:00.000Z');
    expect(
      nextCronOccurrence('5/20 * * * *', new Date('2026-08-30T09:06:00.000Z')).toISOString(),
    ).toBe('2026-08-30T09:25:00.000Z');
  });

  it('rejects malformed or out-of-range fields', () => {
    expect(() => parseCronExpression('0 24 * * *')).toThrow('outside');
    expect(() => parseCronExpression('0 1 * *')).toThrow('five-field');
  });
});
