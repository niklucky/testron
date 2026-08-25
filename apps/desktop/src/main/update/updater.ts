import { createHash } from 'node:crypto';
import { open, mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

const versionPattern =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const artifactNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const updateArtifactSchema = z.object({
  url: z.url().refine((value) => new URL(value).protocol === 'https:', 'HTTPS is required.'),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  size: z.number().int().positive(),
  filename: z.string().regex(artifactNamePattern),
});

export const updateManifestSchema = z.object({
  schemaVersion: z.literal(1),
  version: z.string().regex(versionPattern),
  required: z.boolean(),
  publishedAt: z.iso.datetime(),
  artifacts: z.object({
    'darwin-arm64': updateArtifactSchema,
    'darwin-x64': updateArtifactSchema,
    'win32-x64': updateArtifactSchema,
    'linux-x64': updateArtifactSchema,
  }),
});

export type UpdateManifest = z.infer<typeof updateManifestSchema>;
export type UpdateArtifact = z.infer<typeof updateArtifactSchema>;
type SupportedTarget = keyof UpdateManifest['artifacts'];

export type AvailableUpdate = {
  version: string;
  required: boolean;
  artifact: UpdateArtifact;
};

export type UpdateCheck =
  { status: 'current' } | { status: 'unsupported' } | ({ status: 'available' } & AvailableUpdate);

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const parseVersion = (value: string): { core: number[]; prerelease: string[] } => {
  const match = value.match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
  );
  if (!match) throw new Error(`Invalid application version: ${value}`);
  return {
    core: match.slice(1, 4).map(Number),
    prerelease: match[4] ? match[4].split('.') : [],
  };
};

const compareIdentifier = (left: string, right: string): number => {
  const leftNumber = /^\d+$/.test(left) ? Number(left) : undefined;
  const rightNumber = /^\d+$/.test(right) ? Number(right) : undefined;
  if (leftNumber !== undefined && rightNumber !== undefined)
    return Math.sign(leftNumber - rightNumber);
  if (leftNumber !== undefined) return -1;
  if (rightNumber !== undefined) return 1;
  return left.localeCompare(right);
};

export const compareVersions = (left: string, right: string): number => {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    const comparison = Math.sign(a.core[index]! - b.core[index]!);
    if (comparison !== 0) return comparison;
  }
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length === 0 ? 1 : -1;
  }
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const aIdentifier = a.prerelease[index];
    const bIdentifier = b.prerelease[index];
    if (aIdentifier === undefined || bIdentifier === undefined)
      return aIdentifier === bIdentifier ? 0 : aIdentifier === undefined ? -1 : 1;
    const comparison = compareIdentifier(aIdentifier, bIdentifier);
    if (comparison !== 0) return comparison;
  }
  return 0;
};

const targetFor = (platform: NodeJS.Platform, arch: string): SupportedTarget | undefined => {
  const target = `${platform}-${arch}`;
  return ['darwin-arm64', 'darwin-x64', 'win32-x64', 'linux-x64'].includes(target)
    ? (target as SupportedTarget)
    : undefined;
};

const sha256Of = async (filePath: string): Promise<string> => {
  const file = await open(filePath, 'r');
  const hash = createHash('sha256');
  try {
    for await (const chunk of file.createReadStream({ autoClose: false })) hash.update(chunk);
    return hash.digest('hex');
  } finally {
    await file.close();
  }
};

export class DesktopUpdater {
  constructor(
    private readonly options: {
      manifestUrl: string;
      currentVersion: string;
      platform: NodeJS.Platform;
      arch: string;
      fetch?: Fetcher;
    },
  ) {}

  async check(): Promise<UpdateCheck> {
    const target = targetFor(this.options.platform, this.options.arch);
    if (!target) return { status: 'unsupported' };

    const response = await (this.options.fetch ?? fetch)(this.options.manifestUrl, {
      headers: { accept: 'application/json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Update manifest request failed (${response.status}).`);
    const manifest = updateManifestSchema.parse(await response.json());
    if (compareVersions(manifest.version, this.options.currentVersion) <= 0)
      return { status: 'current' };
    return {
      status: 'available',
      version: manifest.version,
      required: manifest.required,
      artifact: manifest.artifacts[target],
    };
  }

  async download(update: AvailableUpdate, directory: string): Promise<string> {
    await mkdir(directory, { recursive: true });
    const destination = path.join(directory, update.artifact.filename);
    const partial = `${destination}.part`;

    try {
      const existing = await stat(destination).catch(() => undefined);
      if (
        existing?.size === update.artifact.size &&
        (await sha256Of(destination)) === update.artifact.sha256
      )
        return destination;

      const response = await (this.options.fetch ?? fetch)(update.artifact.url, {
        redirect: 'follow',
      });
      if (!response.ok || !response.body)
        throw new Error(`Update download failed (${response.status}).`);

      const file = await open(partial, 'w');
      const hash = createHash('sha256');
      let size = 0;
      try {
        for await (const chunk of response.body) {
          const bytes = Buffer.from(chunk);
          hash.update(bytes);
          size += bytes.byteLength;
          if (size > update.artifact.size)
            throw new Error('The downloaded update is larger than the manifest declares.');
          let offset = 0;
          while (offset < bytes.byteLength) {
            const { bytesWritten } = await file.write(bytes, offset);
            if (bytesWritten === 0) throw new Error('The update download could not be written.');
            offset += bytesWritten;
          }
        }
      } finally {
        await file.close();
      }

      if (size !== update.artifact.size || hash.digest('hex') !== update.artifact.sha256)
        throw new Error('The downloaded update failed integrity verification.');
      await rm(destination, { force: true });
      await rename(partial, destination);
      return destination;
    } catch (error) {
      await rm(partial, { force: true });
      throw error;
    }
  }
}
