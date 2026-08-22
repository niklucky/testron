import { describe, expect, it } from 'vitest';

import { en, ru } from '../src';

describe('locale resources', () => {
  it('keeps English and Russian keys in sync', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
  });
});
