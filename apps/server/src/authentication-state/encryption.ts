import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

interface KeyMaterial {
  version: number;
  key: Buffer;
}

const decodeKey = (encoded: string): Buffer => {
  const value = encoded.trim();
  const key = /^[0-9a-f]{64}$/i.test(value)
    ? Buffer.from(value, 'hex')
    : Buffer.from(value, 'base64');
  if (key.length !== 32)
    throw new Error('Authentication encryption keys must contain exactly 32 bytes.');
  return key;
};

export class AuthenticationEncryption {
  private readonly keys: Map<number, Buffer>;
  private readonly current: KeyMaterial;

  constructor(values: ReadonlyArray<{ version: number; key: string }>) {
    if (values.length === 0)
      throw new Error('At least one authentication encryption key is required.');
    this.keys = new Map(values.map(({ version, key }) => [version, decodeKey(key)]));
    if (this.keys.size !== values.length)
      throw new Error('Authentication encryption key versions must be unique.');
    const current = [...this.keys.entries()].sort(([left], [right]) => right - left)[0];
    if (!current) throw new Error('At least one authentication encryption key is required.');
    this.current = { version: current[0], key: current[1] };
  }

  static fromEnvironment(value: string | undefined): AuthenticationEncryption | undefined {
    if (!value) return undefined;
    const keys = value.split(',').map((entry) => {
      const separator = entry.indexOf(':');
      if (separator < 1) throw new Error('Use version:key for authentication encryption keys.');
      const version = Number(entry.slice(0, separator));
      if (!Number.isInteger(version) || version < 1)
        throw new Error('Authentication encryption key versions must be positive integers.');
      return { version, key: entry.slice(separator + 1) };
    });
    return new AuthenticationEncryption(keys);
  }

  encrypt(value: string, additionalData: string): { value: string; keyVersion: number } {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.current.key, nonce);
    cipher.setAAD(Buffer.from(additionalData));
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      keyVersion: this.current.version,
      value: Buffer.concat([nonce, tag, ciphertext]).toString('base64'),
    };
  }

  decrypt(value: string, keyVersion: number, additionalData: string): string {
    const key = this.keys.get(keyVersion);
    if (!key)
      throw new Error(`Authentication encryption key version ${keyVersion} is unavailable.`);
    const payload = Buffer.from(value, 'base64');
    if (payload.length < 29) throw new Error('Encrypted authentication payload is malformed.');
    const decipher = createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
    decipher.setAAD(Buffer.from(additionalData));
    decipher.setAuthTag(payload.subarray(12, 28));
    return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString(
      'utf8',
    );
  }
}
