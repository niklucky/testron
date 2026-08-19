import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { SecureTokenStore } from '../../src/main/sync/token-store';

const directories: string[] = [];
afterEach(() =>
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })),
);

describe('SecureTokenStore', () => {
  it('persists only the operating-system-encrypted token bytes', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'testron-token-'));
    directories.push(directory);
    const store = new SecureTokenStore(directory, {
      isAvailable: () => true,
      encrypt: (value) => Buffer.from(Buffer.from(value).map((byte) => byte ^ 0x5a)),
      decrypt: (value) => Buffer.from(value.map((byte) => byte ^ 0x5a)).toString(),
    });
    await store.save('server-access-token');
    expect(readFileSync(path.join(directory, 'server-session.bin'), 'utf8')).not.toContain(
      'server-access-token',
    );
    expect(await store.load()).toBe('server-access-token');
    await store.clear();
    expect(await store.load()).toBeUndefined();
  });
});
