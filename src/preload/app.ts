import { contextBridge, ipcRenderer } from 'electron';

import { APP_CHANNELS } from '../main/security';
import type { AppCommand, AppSnapshot, TestronApi } from './api';

const api: TestronApi = {
  command(command: AppCommand): void {
    ipcRenderer.send(APP_CHANNELS.command, command);
  },
  onSnapshot(listener: (snapshot: AppSnapshot) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: AppSnapshot) =>
      listener(snapshot);
    ipcRenderer.on(APP_CHANNELS.snapshot, handler);
    return () => ipcRenderer.removeListener(APP_CHANNELS.snapshot, handler);
  },
};

contextBridge.exposeInMainWorld('testron', api);
