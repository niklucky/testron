import { constants } from 'node:fs';
import { access, mkdir, readFile, rm, stat, statfs, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';

const MEBIBYTE = 1024 * 1024;
const MINIMUM_FREE_BYTES = 750 * MEBIBYTE;
const ESTIMATED_DOWNLOAD_BYTES = 300 * MEBIBYTE;
const LOCK_MAX_AGE_MS = 60 * 60 * 1_000;

export type BrowserInstallationFailure =
  'network' | 'disk-space' | 'permission' | 'dependencies' | 'security' | 'busy' | 'unknown';

export type BrowserInstallationStatus =
  | { status: 'checking'; installPath: string; estimatedDownloadBytes: number }
  | { status: 'missing'; installPath: string; estimatedDownloadBytes: number }
  | { status: 'ready'; installPath: string; estimatedDownloadBytes: number }
  | {
      status: 'installing';
      installPath: string;
      estimatedDownloadBytes: number;
      phase: 'preparing' | 'downloading' | 'extracting' | 'verifying';
      progress?: number;
      downloadedBytes?: number;
      totalBytes?: number;
    }
  | {
      status: 'failed';
      installPath: string;
      estimatedDownloadBytes: number;
      category: BrowserInstallationFailure;
      message: string;
      detail?: string;
    }
  | { status: 'cancelled'; installPath: string; estimatedDownloadBytes: number };

interface InstallOwner {
  pid: number;
  startedAt: number;
}

export interface BrowserInstallerDependencies {
  browserExecutablePath: () => string;
  verifyBrowser: () => Promise<void>;
  spawnInstaller?: (environment: NodeJS.ProcessEnv) => InstallerProcess;
  availableBytes?: () => Promise<number>;
  processIsAlive?: (pid: number) => boolean;
  now?: () => number;
}

type InstallerProcess = ChildProcessByStdio<null, Readable, Readable>;

export const parseDownloadProgress = (
  output: string,
): { progress: number; downloadedBytes: number; totalBytes: number } | undefined => {
  const match = [...output.matchAll(/(\d{1,3})% of ([\d.]+) MiB/gi)].at(-1);
  if (!match) return undefined;
  const progress = Math.min(100, Math.max(0, Number(match[1])));
  const totalBytes = Math.round(Number(match[2]) * MEBIBYTE);
  if (!Number.isFinite(totalBytes)) return undefined;
  return { progress, downloadedBytes: Math.round((progress / 100) * totalBytes), totalBytes };
};

export const classifyInstallationFailure = (detail: string): BrowserInstallationFailure => {
  if (/ENOSPC|not enough (disk )?space|insufficient (disk )?space/i.test(detail))
    return 'disk-space';
  if (/EACCES|EPERM|permission denied|access is denied/i.test(detail)) return 'permission';
  if (/host system is missing dependencies|missing libraries|install-deps/i.test(detail))
    return 'dependencies';
  if (/quarantine|malware|antivirus|blocked by.*security|SIGKILL/i.test(detail)) return 'security';
  if (
    /ENOTFOUND|ECONN|ETIMEDOUT|network|socket|proxy|certificate|download failed|HTTP \d{3}/i.test(
      detail,
    )
  )
    return 'network';
  return 'unknown';
};

const failureMessage = (category: BrowserInstallationFailure): string => {
  switch (category) {
    case 'network':
      return 'Chromium could not be downloaded. Check your connection, proxy, or firewall and retry.';
    case 'disk-space':
      return 'There is not enough free disk space to install Chromium.';
    case 'permission':
      return 'Testron cannot write to the browser installation directory.';
    case 'dependencies':
      return 'Chromium is installed, but required Linux system libraries are missing.';
    case 'security':
      return 'Security software blocked Chromium from being installed or started.';
    case 'busy':
      return 'Another Testron process is already installing Chromium.';
    case 'unknown':
      return 'Chromium could not be installed.';
  }
};

const defaultProcessIsAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

export class BrowserInstaller {
  private readonly lockPath: string;
  private readonly now: () => number;
  private readonly processIsAlive: (pid: number) => boolean;
  private readonly spawnInstaller: (environment: NodeJS.ProcessEnv) => InstallerProcess;
  private readonly availableBytes: () => Promise<number>;
  private state: BrowserInstallationStatus;
  private child?: InstallerProcess;
  private installPromise?: Promise<BrowserInstallationStatus>;
  private cancelled = false;

  constructor(
    readonly installPath: string,
    private readonly cliPath: string,
    private readonly dependencies: BrowserInstallerDependencies,
  ) {
    this.lockPath = path.join(installPath, '.testron-install.lock');
    this.now = dependencies.now ?? Date.now;
    this.processIsAlive = dependencies.processIsAlive ?? defaultProcessIsAlive;
    this.spawnInstaller =
      dependencies.spawnInstaller ??
      ((environment) =>
        spawn(process.execPath, [cliPath, 'install', 'chromium'], {
          env: environment,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        }));
    this.availableBytes =
      dependencies.availableBytes ??
      (async () => {
        const filesystem = await statfs(installPath);
        return Number(filesystem.bavail) * Number(filesystem.bsize);
      });
    this.state = this.statusOf('checking');
  }

  status(): BrowserInstallationStatus {
    return structuredClone(this.state);
  }

  async check(): Promise<BrowserInstallationStatus> {
    const executablePath = this.dependencies.browserExecutablePath();
    try {
      await access(executablePath, constants.X_OK);
      return this.publish(this.statusOf('ready'));
    } catch {
      return this.publish(this.statusOf('missing'));
    }
  }

  install(
    onStatus: (status: BrowserInstallationStatus) => void,
  ): Promise<BrowserInstallationStatus> {
    if (this.installPromise) return this.installPromise;
    this.cancelled = false;
    this.installPromise = this.performInstall(onStatus).finally(() => {
      this.installPromise = undefined;
      this.child = undefined;
    });
    return this.installPromise;
  }

  cancel(): void {
    if (!this.installPromise) return;
    this.cancelled = true;
    this.child?.kill();
  }

  private statusOf(status: 'checking' | 'missing' | 'ready' | 'cancelled') {
    return {
      status,
      installPath: this.installPath,
      estimatedDownloadBytes: ESTIMATED_DOWNLOAD_BYTES,
    };
  }

  private publish(status: BrowserInstallationStatus): BrowserInstallationStatus {
    this.state = status;
    return this.status();
  }

  private update(
    status: BrowserInstallationStatus,
    onStatus: (status: BrowserInstallationStatus) => void,
  ): BrowserInstallationStatus {
    const next = this.publish(status);
    onStatus(next);
    return next;
  }

  private async acquireLock(): Promise<boolean> {
    await mkdir(this.installPath, { recursive: true });
    try {
      await mkdir(this.lockPath);
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
      let owner: InstallOwner | undefined;
      try {
        owner = JSON.parse(await readFile(path.join(this.lockPath, 'owner.json'), 'utf8'));
      } catch {
        // The owner file is written immediately after mkdir. Treat a brand-new
        // incomplete lock as live so two processes cannot steal it in that gap.
      }
      const lockAge = this.now() - (await stat(this.lockPath)).mtimeMs;
      const live =
        (!owner && lockAge < 10_000) ||
        (owner && this.now() - owner.startedAt < LOCK_MAX_AGE_MS && this.processIsAlive(owner.pid));
      if (live) return false;
      await rm(this.lockPath, { recursive: true, force: true });
      await mkdir(this.lockPath);
    }
    await writeFile(
      path.join(this.lockPath, 'owner.json'),
      JSON.stringify({ pid: process.pid, startedAt: this.now() } satisfies InstallOwner),
      'utf8',
    );
    return true;
  }

  private async performInstall(
    onStatus: (status: BrowserInstallationStatus) => void,
  ): Promise<BrowserInstallationStatus> {
    let locked = false;
    let output = '';
    try {
      this.update(
        {
          status: 'installing',
          installPath: this.installPath,
          estimatedDownloadBytes: ESTIMATED_DOWNLOAD_BYTES,
          phase: 'preparing',
        },
        onStatus,
      );
      locked = await this.acquireLock();
      if (!locked) {
        return this.update(
          {
            status: 'failed',
            installPath: this.installPath,
            estimatedDownloadBytes: ESTIMATED_DOWNLOAD_BYTES,
            category: 'busy',
            message: failureMessage('busy'),
          },
          onStatus,
        );
      }
      if ((await this.availableBytes()) < MINIMUM_FREE_BYTES) {
        return this.update(
          {
            status: 'failed',
            installPath: this.installPath,
            estimatedDownloadBytes: ESTIMATED_DOWNLOAD_BYTES,
            category: 'disk-space',
            message: failureMessage('disk-space'),
          },
          onStatus,
        );
      }

      const environment: NodeJS.ProcessEnv = {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: this.installPath,
        ELECTRON_RUN_AS_NODE: '1',
      };
      this.child = this.spawnInstaller(environment);
      const readOutput = (chunk: Buffer | string) => {
        const text = chunk.toString();
        output = `${output}${text}`.slice(-20_000);
        const parsed = parseDownloadProgress(output);
        this.update(
          parsed
            ? {
                status: 'installing',
                installPath: this.installPath,
                estimatedDownloadBytes: ESTIMATED_DOWNLOAD_BYTES,
                phase: parsed.progress === 100 ? 'extracting' : 'downloading',
                ...parsed,
              }
            : {
                status: 'installing',
                installPath: this.installPath,
                estimatedDownloadBytes: ESTIMATED_DOWNLOAD_BYTES,
                phase: /extract|install/i.test(text) ? 'extracting' : 'downloading',
              },
          onStatus,
        );
      };
      this.child.stdout.on('data', readOutput);
      this.child.stderr.on('data', readOutput);
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        this.child!.once('error', reject);
        this.child!.once('close', resolve);
      });
      if (this.cancelled) return this.update(this.statusOf('cancelled'), onStatus);
      if (exitCode !== 0)
        throw new Error(output || `Playwright installer exited with ${exitCode}.`);

      this.update(
        {
          status: 'installing',
          installPath: this.installPath,
          estimatedDownloadBytes: ESTIMATED_DOWNLOAD_BYTES,
          phase: 'verifying',
        },
        onStatus,
      );
      await access(this.dependencies.browserExecutablePath(), constants.X_OK);
      await this.dependencies.verifyBrowser();
      return this.update(this.statusOf('ready'), onStatus);
    } catch (error) {
      if (this.cancelled) return this.update(this.statusOf('cancelled'), onStatus);
      const detail = error instanceof Error ? error.message : String(error);
      const category = classifyInstallationFailure(detail);
      return this.update(
        {
          status: 'failed',
          installPath: this.installPath,
          estimatedDownloadBytes: ESTIMATED_DOWNLOAD_BYTES,
          category,
          message: failureMessage(category),
          detail: detail.slice(0, 4_000),
        },
        onStatus,
      );
    } finally {
      if (locked) await rm(this.lockPath, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
