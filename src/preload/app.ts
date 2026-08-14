import { contextBridge, ipcRenderer } from 'electron';

import { APP_CHANNELS } from '../main/security';
import type { RecordingSnapshot } from '../main/recording/session';
import type { AppCommand, TestronApi } from './api';

const api: TestronApi = {
  command(command: AppCommand): void {
    ipcRenderer.send(APP_CHANNELS.command, command);
  },
  onSnapshot(listener: (snapshot: RecordingSnapshot) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: RecordingSnapshot) =>
      listener(snapshot);
    ipcRenderer.on(APP_CHANNELS.snapshot, handler);
    return () => ipcRenderer.removeListener(APP_CHANNELS.snapshot, handler);
  },
};

contextBridge.exposeInMainWorld('testron', api);
