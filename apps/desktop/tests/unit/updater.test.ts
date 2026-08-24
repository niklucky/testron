import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { compareVersions, DesktopUpdater } from '../../src/main/update/updater';

const temporaryDirectories: string[] = [];

const temporaryDirectory = (): string => {
  const directory = mkdtempSync(path.join(tmpdir(), 'testron-updater-'));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

const artifact = (content: string) => ({
  url: 'https://github.example/Testron-macos-arm64.zip',
  sha256: createHash('sha256').update(content).digest('hex'),
  size: Buffer.byteLength(content),
  filename: 'Testron-macos-arm64.zip',
});

const manifest = (content: string) => ({
  schemaVersion: 1,
  version: '1.2.0',
  required: true,
  publishedAt: '2026-08-24T12:00:00.000Z',
  artifacts: {
    'darwin-arm64': artifact(content),
    'darwin-x64': { ...artifact(content), filename: 'Testron-macos-x64.zip' },
    'win32-x64': { ...artifact(content), filename: 'Testron-windows-x64.zip' },
    'linux-x64': { ...artifact(content), filename: 'Testron-linux-x64.zip' },
  },
});

describe('desktop updater', () => {
  it('compares release and prerelease versions', () => {
    expect(compareVersions('1.2.0', '1.1.9')).toBe(1);
    expect(compareVersions('1.2.0-beta.2', '1.2.0-beta.1')).toBe(1);
    expect(compareVersions('1.2.0-alpha-beta.2', '1.2.0-alpha-beta.1')).toBe(1);
    expect(compareVersions('1.2.0-beta.2', '1.2.0')).toBe(-1);
    expect(compareVersions('1.2.0+build.2', '1.2.0+build.1')).toBe(0);
  });

  it('selects a newer platform artifact and preserves the required flag', async () => {
    const body = JSON.stringify(manifest('release'));
    const updater = new DesktopUpdater({
      manifestUrl: 'https://github.example/update-manifest.json',
      currentVersion: '1.1.0',
      platform: 'darwin',
      arch: 'arm64',
      fetch: async () => new Response(body, { status: 200 }),
    });

    await expect(updater.check()).resolves.toMatchObject({
      status: 'available',
      version: '1.2.0',
      required: true,
      artifact: { filename: 'Testron-macos-arm64.zip' },
    });
  });

  it('downloads and verifies an artifact', async () => {
    const content = 'verified update';
    const updater = new DesktopUpdater({
      manifestUrl: 'https://github.example/update-manifest.json',
      currentVersion: '1.1.0',
      platform: 'darwin',
      arch: 'arm64',
      fetch: async () => new Response(content, { status: 200 }),
    });

    const filePath = await updater.download(
      { version: '1.2.0', required: false, artifact: artifact(content) },
      temporaryDirectory(),
    );

    expect(readFileSync(filePath, 'utf8')).toBe(content);

    const cachedUpdater = new DesktopUpdater({
      manifestUrl: 'https://github.example/update-manifest.json',
      currentVersion: '1.1.0',
      platform: 'darwin',
      arch: 'arm64',
      fetch: async () => {
        throw new Error('The verified cached artifact should be reused.');
      },
    });
    await expect(
      cachedUpdater.download(
        { version: '1.2.0', required: false, artifact: artifact(content) },
        path.dirname(filePath),
      ),
    ).resolves.toBe(filePath);
  });

  it('rejects a corrupt artifact and removes the partial download', async () => {
    const directory = temporaryDirectory();
    const updater = new DesktopUpdater({
      manifestUrl: 'https://github.example/update-manifest.json',
      currentVersion: '1.1.0',
      platform: 'darwin',
      arch: 'arm64',
      fetch: async () => new Response('corrupt', { status: 200 }),
    });

    await expect(
      updater.download(
        { version: '1.2.0', required: false, artifact: artifact('expected') },
        directory,
      ),
    ).rejects.toThrow('integrity verification');
    expect(() => readFileSync(path.join(directory, 'Testron-macos-arm64.zip.part'))).toThrow();
  });
});
