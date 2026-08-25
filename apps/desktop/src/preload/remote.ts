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

export interface TestronDesktopHost {
  platform: 'desktop';
  setLocale(locale: 'en' | 'ru'): void;
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

const host: TestronDesktopHost = {
  platform: 'desktop',
  setLocale: (locale) =>
    ipcRenderer.send(REMOTE_APP_CHANNELS.command, { type: 'set-locale', locale }),
  openLocal: (request) =>
    ipcRenderer.send(REMOTE_APP_CHANNELS.command, {
      type: 'open-local',
      ...request,
      theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
    }),
  showProduct: () => ipcRenderer.send(REMOTE_APP_CHANNELS.command, { type: 'show-product' }),
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
