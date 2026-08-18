import { describe, expect, it } from 'vitest';

import { appCommandSchema } from '../../src/preload/app-command';

const id = '00000000-0000-4000-8000-000000000001';

describe('desktop application command schema', () => {
  it('uses protocol resource invariants for project, environment, and test fields', () => {
    expect(appCommandSchema.parse({ type: 'create-project', name: '  Checkout  ' })).toEqual({
      type: 'create-project',
      name: 'Checkout',
    });
    expect(
      appCommandSchema.safeParse({
        type: 'create-environment',
        projectId: id,
        name: 'Local',
        baseUrl: 'ftp://example.test/',
        testIdAttribute: 'data-testid',
      }).success,
    ).toBe(false);
    expect(
      appCommandSchema.safeParse({
        type: 'create-test',
        projectId: id,
        environmentId: id,
        title: 'x'.repeat(201),
      }).success,
    ).toBe(false);
  });
});
