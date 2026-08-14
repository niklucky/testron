import path from 'node:path';

import { app, BrowserWindow, ipcMain, WebContentsView } from 'electron';
import { z } from 'zod';

import { recorderCandidateSchema } from '../domain/recording/schema';
import type { AppCommand } from '../preload/api';
import { RecordingSession } from './recording/session';
import {
  APP_CHANNELS,
  APP_RENDERER_WEB_PREFERENCES,
  RECORDER_CHANNEL,
  TESTED_WEBSITE_WEB_PREFERENCES,
} from './security';

const TOOLBAR_HEIGHT = 150;
const appCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start-recording') }),
  z.object({ type: z.literal('stop-recording') }),
  z.object({ type: z.literal('navigate'), url: z.url() }),
  z.object({ type: z.literal('request-snapshot') }),
]);

let mainWindow: BrowserWindow | undefined;
let websiteView: WebContentsView | undefined;

const safeUrl = (value: string): string => {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Only HTTP(S) URLs are supported.');
  return url.toString();
};

const createWindow = async (): Promise<void> => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 880,
    minHeight: 640,
    title: 'Testron',
    webPreferences: {
      ...APP_RENDERER_WEB_PREFERENCES,
      preload: path.join(__dirname, 'app.js'),
    },
  });

  websiteView = new WebContentsView({
    webPreferences: {
      ...TESTED_WEBSITE_WEB_PREFERENCES,
      preload: path.join(__dirname, 'recorder.js'),
    },
  });
  mainWindow.contentView.addChildView(websiteView);

  const layout = (): void => {
    const [width, height] = mainWindow?.getContentSize() ?? [0, 0];
    websiteView?.setBounds({
      x: 0,
      y: TOOLBAR_HEIGHT,
      width,
      height: Math.max(0, height - TOOLBAR_HEIGHT),
    });
  };
  layout();
  mainWindow.on('resize', layout);

  const sendSnapshot = (snapshot: ReturnType<RecordingSession['snapshot']>): void => {
    const window = mainWindow;
    if (window && !window.isDestroyed()) window.webContents.send(APP_CHANNELS.snapshot, snapshot);
  };
  const session = new RecordingSession(sendSnapshot);

  websiteView.webContents.setWindowOpenHandler(() => {
    session.warn('Popups are not supported in Phase 0.');
    return { action: 'deny' };
  });
  websiteView.webContents.on('will-navigate', (event, url) => {
    try {
      safeUrl(url);
    } catch {
      event.preventDefault();
      session.warn(`Blocked non-HTTP(S) navigation: ${url}`);
    }
  });
  websiteView.webContents.on('did-navigate', (_event, url) => session.navigated(url));
  websiteView.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (isMainFrame) {
        session.warn(
          `Could not load ${validatedUrl || 'the tested page'} (${errorCode}): ${errorDescription}`,
        );
      }
    },
  );

  ipcMain.on(RECORDER_CHANNEL, (event, payload: unknown) => {
    if (
      event.sender !== websiteView?.webContents ||
      event.senderFrame !== websiteView.webContents.mainFrame
    )
      return;
    const candidate = recorderCandidateSchema.safeParse(payload);
    if (candidate.success) session.accept(candidate.data);
  });

  ipcMain.on(APP_CHANNELS.command, (event, payload: unknown) => {
    if (event.sender !== mainWindow?.webContents) return;
    const parsed = appCommandSchema.safeParse(payload);
    if (!parsed.success) return;
    const command: AppCommand = parsed.data;
    switch (command.type) {
      case 'start-recording':
        session.start();
        break;
      case 'stop-recording':
        session.stop();
        break;
      case 'request-snapshot':
        sendSnapshot(session.snapshot());
        break;
      case 'navigate':
        try {
          void websiteView?.webContents.loadURL(safeUrl(command.url));
        } catch (error) {
          session.warn(error instanceof Error ? error.message : 'Invalid URL.');
        }
        break;
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.on('closed', () => {
    ipcMain.removeAllListeners(RECORDER_CHANNEL);
    ipcMain.removeAllListeners(APP_CHANNELS.command);
    websiteView = undefined;
    mainWindow = undefined;
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
  try {
    await websiteView.webContents.loadURL('http://127.0.0.1:4174');
  } catch (error) {
    session.warn(error instanceof Error ? error.message : 'Could not load the fixture page.');
  }
};

app.whenReady().then(async () => {
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
