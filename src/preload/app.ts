import { contextBridge, ipcRenderer } from 'electron';

import { APP_CHANNELS, RECORD_CHANNELS } from '../main/security';
import type { AppCommand, AppSnapshot, TestronApi } from './api';
import type { RecordPanelEvent, RecordPanelState } from './record';

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
  onRecordState(listener: (state: RecordPanelState) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, state: RecordPanelState) => listener(state);
    ipcRenderer.on(RECORD_CHANNELS.state, handler);
    return () => ipcRenderer.removeListener(RECORD_CHANNELS.state, handler);
  },
  sendRecordEvent(event: RecordPanelEvent): void {
    ipcRenderer.send(RECORD_CHANNELS.event, event);
  },
  onRecordEvent(listener: (event: RecordPanelEvent) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, payload: RecordPanelEvent) =>
      listener(payload);
    ipcRenderer.on(RECORD_CHANNELS.event, handler);
    return () => ipcRenderer.removeListener(RECORD_CHANNELS.event, handler);
  },
};

contextBridge.exposeInMainWorld('testron', api);
