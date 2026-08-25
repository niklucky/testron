export type DesktopBrowserInstallation =
  | {
      status: 'checking' | 'missing' | 'ready' | 'cancelled';
      installPath: string;
      estimatedDownloadBytes: number;
    }
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
      category:
        'network' | 'disk-space' | 'permission' | 'dependencies' | 'security' | 'busy' | 'unknown';
      message: string;
      detail?: string;
    };

export interface DesktopReplayState {
  status: 'idle' | 'running' | 'passed' | 'failed' | 'cancelled' | 'timedOut';
  steps: Array<{
    index: number;
    action: string;
    locator?: string;
    status: 'pending' | 'running' | 'passed' | 'failed';
    durationMs?: number;
    error?: string;
    pageUrl?: string;
  }>;
  startedAt?: string;
  durationMs?: number;
  screenshotPath?: string;
  tracePath?: string;
  error?: string;
}

export interface DesktopRuntimeState {
  replay: DesktopReplayState;
  browserInstallation: DesktopBrowserInstallation;
  /** Changes whenever the desktop reloads server-backed workspace data. */
  workspaceRevision: number;
}

export interface DesktopRunRequest {
  projectId: string;
  environmentId?: string;
  testId: string;
  environmentVariables: Record<string, string>;
  timeoutMs: number;
  authStateMode: 'ignore' | 'reuse' | 'refresh';
  headed?: boolean;
}

export interface DesktopAuthenticationRefreshRequest {
  profileId: string;
  environmentId: string;
  secretValues: Record<string, string>;
}

export interface DesktopAuthenticationClearRequest {
  profileId: string;
  environmentId: string;
}
