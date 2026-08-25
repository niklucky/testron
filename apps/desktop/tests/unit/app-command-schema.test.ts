import { describe, expect, it } from 'vitest';

import { appCommandSchema } from '../../src/preload/app-command';

const id = '00000000-0000-4000-8000-000000000001';

describe('desktop application command schema', () => {
  it('accepts the one-shot hover capture mode', () => {
    expect(
      appCommandSchema.parse({
        type: 'set-capture-mode',
        mode: 'hover',
        assertion: 'visible',
      }),
    ).toMatchObject({ type: 'set-capture-mode', mode: 'hover' });
  });

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
        environmentIds: [id],
        title: 'x'.repeat(201),
      }).success,
    ).toBe(false);
    expect(
      appCommandSchema.parse({ type: 'prepare-new-test', title: '  Checkout flow  ' }),
    ).toEqual({ type: 'prepare-new-test', title: 'Checkout flow' });
  });

  it('validates the desktop login commands', () => {
    expect(
      appCommandSchema.parse({
        type: 'login-server',
        email: 'Owner@Example.test',
        password: 'correct horse battery staple',
      }),
    ).toEqual({
      type: 'login-server',
      email: 'owner@example.test',
      password: 'correct horse battery staple',
    });
    expect(
      appCommandSchema.parse({
        type: 'register-server',
        name: 'New User',
        email: 'new@example.test',
        password: 'another correct password',
      }),
    ).toMatchObject({ type: 'register-server', name: 'New User', email: 'new@example.test' });
    expect(
      appCommandSchema.safeParse({
        type: 'login-server',
        email: 'not-an-email',
        password: 'correct horse battery staple',
      }).success,
    ).toBe(false);
    expect(
      appCommandSchema.safeParse({
        type: 'login-server',
        email: 'owner@example.test',
        password: '12345678',
      }).success,
    ).toBe(true);
    expect(
      appCommandSchema.safeParse({
        type: 'login-server',
        email: 'owner@example.test',
        password: '1234567',
      }).success,
    ).toBe(false);
  });

  it('validates server-backed project settings commands', () => {
    expect(
      appCommandSchema.parse({
        type: 'update-project',
        projectId: id,
        baseRevision: 1,
        name: '  Checkout  ',
        url: 'https://checkout.example.test/',
      }),
    ).toMatchObject({ name: 'Checkout', baseRevision: 1 });
    expect(
      appCommandSchema.safeParse({
        type: 'update-environment',
        environmentId: id,
        baseRevision: 1,
        name: 'Staging',
        baseUrl: 'ftp://example.test/',
      }).success,
    ).toBe(false);
  });

  it('validates server-backed test suite mutations', () => {
    expect(
      appCommandSchema.parse({
        type: 'create-test-suite',
        projectId: id,
        name: '  Checkout  ',
      }),
    ).toEqual({ type: 'create-test-suite', projectId: id, name: 'Checkout' });
    expect(
      appCommandSchema.parse({
        type: 'update-test-suite',
        testSuiteId: id,
        baseRevision: 2,
        name: 'Checkout critical path',
      }),
    ).toMatchObject({ baseRevision: 2, name: 'Checkout critical path' });
    expect(
      appCommandSchema.safeParse({
        type: 'delete-test-suite',
        testSuiteId: id,
        baseRevision: 0,
      }).success,
    ).toBe(false);
  });

  it('validates server-backed test deletion', () => {
    expect(appCommandSchema.parse({ type: 'delete-test', testId: id })).toEqual({
      type: 'delete-test',
      testId: id,
    });
    expect(appCommandSchema.safeParse({ type: 'delete-test', testId: 'not-an-id' }).success).toBe(
      false,
    );
  });

  it('validates prerequisite replacement', () => {
    expect(
      appCommandSchema.parse({
        type: 'replace-prerequisites',
        testId: id,
        prerequisites: ['  Signed in  ', 'Feature enabled'],
      }),
    ).toEqual({
      type: 'replace-prerequisites',
      testId: id,
      prerequisites: ['Signed in', 'Feature enabled'],
    });
    expect(
      appCommandSchema.safeParse({
        type: 'replace-prerequisites',
        testId: id,
        prerequisites: [''],
      }).success,
    ).toBe(false);
  });

  it('validates server-backed test moves', () => {
    expect(
      appCommandSchema.parse({
        type: 'move-test',
        testId: id,
        projectId: id,
        testSuiteId: id,
        environmentIds: [id],
      }),
    ).toMatchObject({ type: 'move-test', testSuiteId: id });
    expect(
      appCommandSchema.safeParse({
        type: 'move-test',
        testId: id,
        projectId: id,
        testSuiteId: 'not-an-id',
        environmentIds: [id],
      }).success,
    ).toBe(false);
  });

  it('validates server-backed profile updates', () => {
    expect(
      appCommandSchema.parse({
        type: 'update-profile',
        profileId: id,
        environmentId: id,
        baseRevision: 1,
        name: 'Administrator',
        authenticationType: 'credentials',
        variables: [
          { name: 'username', value: 'admin@example.test', sensitive: false },
          { name: 'password', value: 'secret value', sensitive: true },
        ],
      }),
    ).toMatchObject({ type: 'update-profile', baseRevision: 1 });
    expect(
      appCommandSchema.parse({
        type: 'create-profile',
        environmentId: id,
        name: 'API token',
        authenticationType: 'headers',
        variables: [{ name: 'Authorization', value: 'Bearer secret', sensitive: true }],
      }),
    ).toMatchObject({ type: 'create-profile', authenticationType: 'headers' });
    expect(
      appCommandSchema.safeParse({
        type: 'create-profile',
        environmentId: id,
        name: 'Duplicate headers',
        authenticationType: 'headers',
        variables: [
          { name: 'Authorization', value: 'one', sensitive: true },
          { name: 'authorization', value: 'two', sensitive: true },
        ],
      }).success,
    ).toBe(false);
    expect(
      appCommandSchema.safeParse({
        type: 'update-profile',
        profileId: id,
        environmentId: id,
        baseRevision: 1,
        name: 'Administrator',
        authenticationType: 'credentials',
        variables: [
          { name: 'username', value: 'one', sensitive: false },
          { name: 'username', value: 'two', sensitive: false },
        ],
      }).success,
    ).toBe(false);
    expect(
      appCommandSchema.parse({
        type: 'create-profile',
        environmentId: id,
        name: 'Browser administrator',
        authenticationType: 'browser-session',
        variables: [],
      }),
    ).toMatchObject({ authenticationType: 'browser-session' });
    expect(
      appCommandSchema.parse({
        type: 'create-profile',
        environmentId: id,
        name: 'Saved browser session',
        authenticationType: 'storage-state',
        variables: [
          {
            name: 'storageState',
            value: JSON.stringify({ cookies: [], origins: [] }),
            sensitive: true,
          },
        ],
      }),
    ).toMatchObject({ authenticationType: 'storage-state' });
  });

  it('validates account and membership commands', () => {
    expect(appCommandSchema.parse({ type: 'update-account-profile', name: '  Nikita  ' })).toEqual({
      type: 'update-account-profile',
      name: 'Nikita',
    });
    expect(
      appCommandSchema.safeParse({
        type: 'change-account-password',
        currentPassword: '1234567',
        newPassword: 'another correct password',
      }).success,
    ).toBe(false);
    expect(
      appCommandSchema.parse({
        type: 'create-invitation',
        projectId: id,
        email: 'member@example.test',
      }),
    ).toMatchObject({ type: 'create-invitation', projectId: id });
    expect(
      appCommandSchema.parse({
        type: 'set-member-blocked',
        projectId: id,
        userId: id,
        blocked: true,
      }),
    ).toMatchObject({ type: 'set-member-blocked', blocked: true });
  });
});
