import { contextBridge, ipcRenderer } from 'electron';

import { APP_CHANNELS, RECORD_CHANNELS } from '../main/security';
import type { AppCommand, AppSnapshot, TestronApi } from './api';
import type { SessionMenuId } from './app-command';
import type { RecordPanelEvent, RecordPanelState } from './record';

const api: TestronApi = {
  command(command: AppCommand): void {
    ipcRenderer.send(APP_CHANNELS.command, command);
  },
  onLocale(listener: (locale: 'en' | 'ru') => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, locale: 'en' | 'ru') => listener(locale);
    ipcRenderer.on(APP_CHANNELS.locale, handler);
    return () => ipcRenderer.removeListener(APP_CHANNELS.locale, handler);
  },
  onSnapshot(listener: (snapshot: AppSnapshot) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: AppSnapshot) =>
      listener(snapshot);
    ipcRenderer.on(APP_CHANNELS.snapshot, handler);
    return () => ipcRenderer.removeListener(APP_CHANNELS.snapshot, handler);
  },
  onSessionMenuSelect(
    listener: (selection: { menu: SessionMenuId; id: string }) => void,
  ): () => void {
    const handler = (
      _event: Electron.IpcRendererEvent,
      selection: { menu: SessionMenuId; id: string },
    ) => listener(selection);
    ipcRenderer.on(APP_CHANNELS.sessionMenuSelection, handler);
    return () => ipcRenderer.removeListener(APP_CHANNELS.sessionMenuSelection, handler);
  },
  onTargetUrl(listener: (url: string, recreate?: boolean) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, url: string, recreate?: boolean) =>
      listener(url, recreate);
    ipcRenderer.on(APP_CHANNELS.targetUrl, handler);
    return () => ipcRenderer.removeListener(APP_CHANNELS.targetUrl, handler);
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
