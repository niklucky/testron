import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { BrowserStorageState } from './runner';
import type { TokenEncryption } from '../sync/token-store';

export interface DesktopAuthenticationStateIdentity {
  owner: 'desktop';
  testronAccountId?: string;
  projectId: string;
  environmentId: string;
  environmentAuthRevision: number;
  profileId: string;
  profileRevision: number;
  authFlowId: string;
  authFlowRevision: number;
  setupTestId: string;
  setupTestRevision: number;
  secretBindingsRevision: number;
  browserEngine: 'chromium';
  formatVersion: 1;
}

export interface StoredDesktopAuthenticationState {
  identity: DesktopAuthenticationStateIdentity;
  storageState: BrowserStorageState;
  createdAt: string;
  expiresAt: string;
}

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (typeof value === 'object' && value !== null)
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(',')}}`;
  return JSON.stringify(value);
};

const sameIdentity = (
  left: DesktopAuthenticationStateIdentity,
  right: DesktopAuthenticationStateIdentity,
): boolean => stable(left) === stable(right);

export const desktopSecretBindingsRevision = (
  assignmentRevision: number,
  secretRevisions: ReadonlyArray<{ id: string; revision: number }>,
): number =>
  Number.parseInt(
    createHash('sha256')
      .update(stable({ assignmentRevision, secretRevisions }))
      .digest('hex')
      .slice(0, 7),
    16,
  ) + 1;

export class SecureAuthenticationStateStore {
  constructor(
    private readonly directory: string,
    private readonly encryption: TokenEncryption,
  ) {}

  private file(identity: DesktopAuthenticationStateIdentity): string {
    return this.fileForScope(identity);
  }

  private fileForScope(scope: {
    testronAccountId?: string;
    projectId: string;
    environmentId: string;
    profileId: string;
  }): string {
    const key = [
      scope.testronAccountId ?? 'local',
      scope.projectId,
      scope.environmentId,
      scope.profileId,
    ].join(':');
    return path.join(this.directory, `${createHash('sha256').update(key).digest('hex')}.bin`);
  }

  async load(
    identity: DesktopAuthenticationStateIdentity,
    now = new Date(),
  ): Promise<StoredDesktopAuthenticationState | undefined> {
    if (!this.encryption.isAvailable()) return undefined;
    try {
      const decrypted = this.encryption.decrypt(await readFile(this.file(identity)));
      const stored = JSON.parse(decrypted) as StoredDesktopAuthenticationState;
      if (!sameIdentity(stored.identity, identity) || Date.parse(stored.expiresAt) <= now.getTime())
        return undefined;
      return stored;
    } catch {
      return undefined;
    }
  }

  async save(state: StoredDesktopAuthenticationState): Promise<void> {
    if (!this.encryption.isAvailable())
      throw new Error('Operating-system credential encryption is unavailable.');
    const file = this.file(state.identity);
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, this.encryption.encrypt(JSON.stringify(state)), { mode: 0o600 });
    await rename(temporary, file);
  }

  clear(identity: DesktopAuthenticationStateIdentity): Promise<void> {
    return rm(this.file(identity), { force: true });
  }

  clearScope(scope: {
    testronAccountId?: string;
    projectId: string;
    environmentId: string;
    profileId: string;
  }): Promise<void> {
    return rm(this.fileForScope(scope), { force: true });
  }

  /** Removes the pre-flow plaintext cache during migration. */
  removeLegacyPlaintextDirectory(dataDirectory: string): Promise<void> {
    return rm(path.join(dataDirectory, 'auth'), { recursive: true, force: true });
  }
}
