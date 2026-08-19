import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface TokenEncryption {
  isAvailable(): boolean;
  encrypt(value: string): Buffer;
  decrypt(value: Buffer): string;
}

export class SecureTokenStore {
  private readonly file: string;

  constructor(
    directory: string,
    private readonly encryption: TokenEncryption,
  ) {
    this.file = path.join(directory, 'server-session.bin');
  }

  async load(): Promise<string | undefined> {
    if (!this.encryption.isAvailable()) return undefined;
    try {
      return this.encryption.decrypt(await readFile(this.file));
    } catch {
      return undefined;
    }
  }

  async save(token: string): Promise<void> {
    if (!this.encryption.isAvailable())
      throw new Error('Operating-system credential encryption is unavailable.');
    await mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    await writeFile(temporary, this.encryption.encrypt(token), { mode: 0o600 });
    await rename(temporary, this.file);
  }

  clear(): Promise<void> {
    return rm(this.file, { force: true });
  }
}
