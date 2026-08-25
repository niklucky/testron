import { describe, expect, it } from 'vitest';

import { AuthenticationEncryption } from '../src/authentication-state/encryption';

describe('AuthenticationEncryption', () => {
  it('encrypts with scope-bound authenticated data and supports retained keys', () => {
    const oldKey = Buffer.alloc(32, 1).toString('base64');
    const newKey = Buffer.alloc(32, 2).toString('base64');
    const old = new AuthenticationEncryption([{ version: 1, key: oldKey }]);
    const encrypted = old.encrypt('secret-value', 'project-a:secret-a');
    const rotated = new AuthenticationEncryption([
      { version: 1, key: oldKey },
      { version: 2, key: newKey },
    ]);
    expect(rotated.decrypt(encrypted.value, encrypted.keyVersion, 'project-a:secret-a')).toBe(
      'secret-value',
    );
    expect(() =>
      rotated.decrypt(encrypted.value, encrypted.keyVersion, 'project-b:secret-a'),
    ).toThrow();
    expect(rotated.encrypt('next', 'project-a:secret-a').keyVersion).toBe(2);
  });
});
