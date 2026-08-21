import { EventEmitter } from 'node:events';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';

import { afterEach, describe, expect, it } from 'vitest';

import {
  BrowserInstaller,
  classifyInstallationFailure,
  parseDownloadProgress,
} from '../../src/main/replay/browser-installer';

const temporaryDirectories: string[] = [];

const temporaryDirectory = (): string => {
  const directory = mkdtempSync(path.join(tmpdir(), 'testron-browser-installer-'));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('browser installer', () => {
  it('parses Playwright progress and classifies actionable failures', () => {
    expect(parseDownloadProgress('|■■■■      | 40% of 125.5 MiB')).toEqual({
      progress: 40,
      downloadedBytes: 52_638_515,
      totalBytes: 131_596_288,
    });
    expect(classifyInstallationFailure('getaddrinfo ENOTFOUND cdn.playwright.dev')).toBe('network');
    expect(classifyInstallationFailure('write failed: ENOSPC')).toBe('disk-space');
    expect(classifyInstallationFailure('Host system is missing dependencies')).toBe('dependencies');
  });

  it('checks the expected executable and publishes installation phases', async () => {
    const installPath = temporaryDirectory();
    const executablePath = path.join(installPath, 'chromium');
    let verified = false;
    const installer = new BrowserInstaller(installPath, '/playwright/cli.js', {
      browserExecutablePath: () => executablePath,
      availableBytes: async () => 2 * 1024 * 1024 * 1024,
      verifyBrowser: async () => {
        verified = true;
      },
      spawnInstaller: () => {
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        const process = new EventEmitter() as ChildProcessByStdio<null, Readable, Readable>;
        process.stdout = stdout;
        process.stderr = stderr;
        process.stdin = null;
        process.kill = () => true;
        queueMicrotask(() => {
          stdout.write('|■■■■■■■■■■| 100% of 125.5 MiB');
          writeFileSync(executablePath, 'chromium');
          chmodSync(executablePath, 0o755);
          process.emit('close', 0);
        });
        return process;
      },
    });

    expect((await installer.check()).status).toBe('missing');
    const phases: string[] = [];
    const result = await installer.install((status) => {
      if (status.status === 'installing') phases.push(status.phase);
    });

    expect(result.status).toBe('ready');
    expect(phases).toEqual(expect.arrayContaining(['preparing', 'extracting', 'verifying']));
    expect(verified).toBe(true);
    expect((await installer.check()).status).toBe('ready');
  });
});
