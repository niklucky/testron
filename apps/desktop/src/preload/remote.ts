import { contextBridge, ipcRenderer } from 'electron';
import type {
  DesktopAuthenticationRefreshRequest,
  DesktopAuthenticationClearRequest,
  DesktopRunRequest,
  DesktopRuntimeState,
} from '@testron/protocol';

import { REMOTE_APP_CHANNELS } from '../main/security';

export type LocalSurfaceRequest = {
  route: 'record' | 'recovery';
  projectId?: string;
  environmentId?: string;
  testId?: string;
};

export type ShellSurface = 'auth' | 'product';

/** Which server this desktop is pointed at, handed to the webapp before it loads. */
export interface DesktopWorkspaceInfo {
  /** Origin of the webapp/server in use. */
  current: string;
  /** Origin the build ships with. */
  default: string;
  /** Custom servers used before, most recent first. */
  recent: string[];
  /** The window is translucent (macOS vibrancy); the sign-in page paints no plane. */
  glass: boolean;
}

export interface TestronDesktopHost {
  platform: 'desktop';
  workspace: DesktopWorkspaceInfo;
  setLocale(locale: 'en' | 'ru'): void;
  selectWorkspace(url: string): void;
  forgetWorkspace(url: string): void;
  /** The remote page says what it shows so the shell can size and style the window. */
  setSurface(surface: ShellSurface): void;
  openLocal(request: LocalSurfaceRequest): void;
  showProduct(): void;
  login(email: string, password: string): void;
  register(name: string, email: string, password: string): void;
  requestRuntimeState(): void;
  openReplayArtifact(artifact: 'screenshot' | 'trace'): void;
  runTest(request: DesktopRunRequest): void;
  refreshAuthentication(request: DesktopAuthenticationRefreshRequest): void;
  clearAuthentication(request: DesktopAuthenticationClearRequest): void;
  cancelRun(): void;
  installBrowser(): void;
  cancelBrowserInstall(): void;
  onRuntimeState(listener: (state: DesktopRuntimeState) => void): () => void;
}

const WORKSPACE_ARGUMENT = '--testron-workspace=';

const readWorkspace = (): DesktopWorkspaceInfo => {
  const fallback: DesktopWorkspaceInfo = {
    current: window.location.origin,
    default: window.location.origin,
    recent: [],
    glass: false,
  };
  const argument = process.argv.find((item) => item.startsWith(WORKSPACE_ARGUMENT));
  if (!argument) return fallback;
  try {
    const parsed: unknown = JSON.parse(argument.slice(WORKSPACE_ARGUMENT.length));
    if (typeof parsed !== 'object' || parsed === null) return fallback;
    const candidate = parsed as Partial<DesktopWorkspaceInfo>;
    return {
      current: typeof candidate.current === 'string' ? candidate.current : fallback.current,
      default: typeof candidate.default === 'string' ? candidate.default : fallback.default,
      recent: Array.isArray(candidate.recent)
        ? candidate.recent.filter((item): item is string => typeof item === 'string')
        : [],
      glass: candidate.glass === true,
    };
  } catch {
    return fallback;
  }
};

const host: TestronDesktopHost = {
  platform: 'desktop',
  workspace: readWorkspace(),
  setLocale: (locale) =>
    ipcRenderer.send(REMOTE_APP_CHANNELS.command, { type: 'set-locale', locale }),
  openLocal: (request) =>
    ipcRenderer.send(REMOTE_APP_CHANNELS.command, {
      type: 'open-local',
      ...request,
      theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
    }),
  showProduct: () => ipcRenderer.send(REMOTE_APP_CHANNELS.command, { type: 'show-product' }),
  selectWorkspace: (url) =>
    ipcRenderer.send(REMOTE_APP_CHANNELS.command, { type: 'select-workspace', url }),
  forgetWorkspace: (url) =>
    ipcRenderer.send(REMOTE_APP_CHANNELS.command, { type: 'forget-workspace', url }),
  setSurface: (surface) =>
    ipcRenderer.send(REMOTE_APP_CHANNELS.command, { type: 'set-surface', surface }),
  login: (email, password) =>
    ipcRenderer.send(REMOTE_APP_CHANNELS.command, { type: 'login', email, password }),
  register: (name, email, password) =>
    ipcRenderer.send(REMOTE_APP_CHANNELS.command, { type: 'register', name, email, password }),
  requestRuntimeState: () =>
    ipcRenderer.send(REMOTE_APP_CHANNELS.command, { type: 'request-runtime-state' }),
  openReplayArtifact: (artifact) =>
    ipcRenderer.send(REMOTE_APP_CHANNELS.command, { type: 'open-replay-artifact', artifact }),
  runTest: (request) =>
    ipcRenderer.send(REMOTE_APP_CHANNELS.command, { type: 'run-test', ...request }),
  refreshAuthentication: (request) =>
    ipcRenderer.send(REMOTE_APP_CHANNELS.command, {
      type: 'refresh-desktop-authentication',
      ...request,
    }),
  clearAuthentication: (request) =>
    ipcRenderer.send(REMOTE_APP_CHANNELS.command, {
      type: 'clear-desktop-authentication',
      ...request,
    }),
  cancelRun: () => ipcRenderer.send(REMOTE_APP_CHANNELS.command, { type: 'cancel-run' }),
  installBrowser: () => ipcRenderer.send(REMOTE_APP_CHANNELS.command, { type: 'install-browser' }),
  cancelBrowserInstall: () =>
    ipcRenderer.send(REMOTE_APP_CHANNELS.command, { type: 'cancel-browser-install' }),
  onRuntimeState: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, state: DesktopRuntimeState) =>
      listener(state);
    ipcRenderer.on(REMOTE_APP_CHANNELS.runtimeState, wrapped);
    return () => ipcRenderer.removeListener(REMOTE_APP_CHANNELS.runtimeState, wrapped);
  },
};

contextBridge.exposeInMainWorld('testronDesktop', host);
