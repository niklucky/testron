import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  SecureAuthenticationStateStore,
  type DesktopAuthenticationStateIdentity,
} from '../../src/main/replay/auth-state-store';

const directories: string[] = [];
afterEach(() =>
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })),
);

const identity: DesktopAuthenticationStateIdentity = {
  owner: 'desktop',
  projectId: 'project',
  environmentId: 'environment',
  environmentAuthRevision: 1,
  profileId: 'profile',
  profileRevision: 1,
  authFlowId: 'flow',
  authFlowRevision: 1,
  setupTestId: 'test',
  setupTestRevision: 1,
  secretBindingsRevision: 1,
  browserEngine: 'chromium',
  formatVersion: 1,
};

describe('SecureAuthenticationStateStore', () => {
  it('encrypts state, rejects stale identities, and expires state', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'testron-auth-state-'));
    directories.push(directory);
    const store = new SecureAuthenticationStateStore(directory, {
      isAvailable: () => true,
      encrypt: (value) => Buffer.from(Buffer.from(value).map((byte) => byte ^ 0x5a)),
      decrypt: (value) => Buffer.from(value.map((byte) => byte ^ 0x5a)).toString(),
    });
    await store.save({
      identity,
      storageState: { cookies: [], origins: [] },
      createdAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-01-01T02:00:00.000Z',
    });
    const files = readFileSync(
      path.join(
        directory,
        `${(await import('node:crypto')).createHash('sha256').update('local:project:environment:profile').digest('hex')}.bin`,
      ),
      'utf8',
    );
    expect(files).not.toContain('cookie');
    expect(await store.load(identity, new Date('2026-01-01T01:00:00.000Z'))).toBeDefined();
    expect(
      await store.load({ ...identity, profileRevision: 2 }, new Date('2026-01-01T01:00:00.000Z')),
    ).toBeUndefined();
    expect(await store.load(identity, new Date('2026-01-01T03:00:00.000Z'))).toBeUndefined();
  });
});
