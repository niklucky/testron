import { contextBridge, ipcRenderer } from 'electron';

import { REMOTE_APP_CHANNELS } from '../main/security';

export type LocalSurfaceRequest = {
  route: 'record' | 'test' | 'run' | 'recovery';
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
};

contextBridge.exposeInMainWorld('testronDesktop', host);
