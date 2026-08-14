import path from 'node:path';
import { writeFile } from 'node:fs/promises';

import { app, BrowserWindow, clipboard, dialog, ipcMain, WebContentsView } from 'electron';
import { z } from 'zod';

import { recorderCandidateSchema } from '../domain/recording/schema';
import type { AppCommand } from '../preload/api';
import { TestronRepository } from './persistence/repository';
import { RecordingSession } from './recording/session';
import {
  APP_CHANNELS,
  APP_RENDERER_WEB_PREFERENCES,
  RECORDER_CHANNEL,
  RECORDER_CONFIG_CHANNEL,
  TESTED_WEBSITE_WEB_PREFERENCES,
} from './security';

const TOOLBAR_HEIGHT = 360;
const appCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start-recording') }),
  z.object({ type: z.literal('stop-recording') }),
  z.object({ type: z.literal('pause-recording') }),
  z.object({ type: z.literal('resume-recording') }),
  z.object({ type: z.literal('undo-step') }),
  z.object({ type: z.literal('finish-recording') }),
  z.object({ type: z.literal('delete-step'), index: z.number().int().nonnegative() }),
  z.object({
    type: z.literal('move-step'),
    index: z.number().int().nonnegative(),
    direction: z.union([z.literal(-1), z.literal(1)]),
  }),
  z.object({ type: z.literal('navigate'), url: z.url() }),
  z.object({ type: z.literal('request-snapshot') }),
  z.object({ type: z.literal('create-project'), name: z.string().trim().min(1).max(100) }),
  z.object({
    type: z.literal('create-environment'),
    projectId: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    baseUrl: z.url(),
    testIdAttribute: z.string().trim().min(1).max(100),
  }),
  z.object({
    type: z.literal('create-test'),
    projectId: z.string().uuid(),
    environmentId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
  }),
  z.object({ type: z.literal('select-project'), projectId: z.string().uuid() }),
  z.object({ type: z.literal('select-environment'), environmentId: z.string().uuid() }),
  z.object({ type: z.literal('select-test'), testId: z.string().uuid() }),
  z.object({ type: z.literal('copy-source') }),
  z.object({ type: z.literal('export-source') }),
]);

let mainWindow: BrowserWindow | undefined;
let websiteView: WebContentsView | undefined;
let repository: TestronRepository | undefined;

const safeUrl = (value: string): string => {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Only HTTP(S) URLs are supported.');
  return url.toString();
};

const createWindow = async (): Promise<void> => {
  const store = repository;
  if (!store) throw new Error('Persistence is not initialized.');
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

  const projects = store.listProjects();
  const environments = store.listEnvironments();
  const tests = store.listTests();
  let selectedProjectId = projects[0]?.id;
  let selectedEnvironmentId = environments.find(
    (environment) => environment.projectId === selectedProjectId,
  )?.id;
  let selectedTestId = tests.find((test) => test.projectId === selectedProjectId)?.id;

  const librarySnapshot = () => ({
    projects: store.listProjects(),
    environments: store.listEnvironments(),
    tests: store.listTests(),
    ...(selectedProjectId ? { selectedProjectId } : {}),
    ...(selectedEnvironmentId ? { selectedEnvironmentId } : {}),
    ...(selectedTestId ? { selectedTestId } : {}),
  });
  const sendSnapshot = (snapshot: ReturnType<RecordingSession['snapshot']>): void => {
    const window = mainWindow;
    if (window && !window.isDestroyed())
      window.webContents.send(APP_CHANNELS.snapshot, {
        ...snapshot,
        library: librarySnapshot(),
      });
  };
  const session = new RecordingSession(sendSnapshot, (steps) => {
    if (selectedTestId) store.replaceSteps(selectedTestId, steps);
  });

  const selectedContext = () => {
    const selectedTest = store.listTests().find((test) => test.id === selectedTestId);
    const environment = store
      .listEnvironments()
      .find((candidate) => candidate.id === (selectedTest?.environmentId ?? selectedEnvironmentId));
    return { selectedTest, environment };
  };
  const applyContext = (): void => {
    const { selectedTest, environment } = selectedContext();
    session.setGenerationContext(selectedTest?.title ?? 'recorded test');
    if (websiteView && !websiteView.webContents.isDestroyed()) {
      websiteView.webContents.send(RECORDER_CONFIG_CHANNEL, {
        testIdAttribute: environment?.testIdAttribute ?? 'data-testid',
      });
    }
  };
  if (selectedTestId) {
    const { selectedTest } = selectedContext();
    if (selectedTest) session.load(selectedTest.title, store.loadSteps(selectedTest.id));
  }

  websiteView.webContents.setWindowOpenHandler(() => {
    session.warn('Popups are not supported yet.');
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
  websiteView.webContents.on('did-navigate', (_event, url) => {
    session.navigated(url);
    const { environment } = selectedContext();
    websiteView?.webContents.send(RECORDER_CONFIG_CHANNEL, {
      testIdAttribute: environment?.testIdAttribute ?? 'data-testid',
    });
  });
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
      case 'pause-recording':
        session.pause();
        break;
      case 'resume-recording':
        session.resume();
        break;
      case 'undo-step':
        session.undo();
        break;
      case 'finish-recording':
        session.finish();
        break;
      case 'delete-step':
        session.deleteStep(command.index);
        break;
      case 'move-step':
        session.moveStep(command.index, command.direction);
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
      case 'create-project': {
        const project = store.createProject(command.name);
        selectedProjectId = project.id;
        selectedEnvironmentId = undefined;
        selectedTestId = undefined;
        session.load('recorded test', []);
        break;
      }
      case 'create-environment': {
        const baseUrl = safeUrl(command.baseUrl);
        const environment = store.createEnvironment(
          command.projectId,
          command.name,
          baseUrl,
          command.testIdAttribute,
        );
        selectedProjectId = command.projectId;
        selectedEnvironmentId = environment.id;
        applyContext();
        break;
      }
      case 'create-test': {
        const test = store.createTest(command.projectId, command.environmentId, command.title);
        selectedProjectId = command.projectId;
        selectedEnvironmentId = command.environmentId;
        selectedTestId = test.id;
        session.load(test.title, []);
        break;
      }
      case 'select-project':
        selectedProjectId = command.projectId;
        selectedEnvironmentId = store
          .listEnvironments()
          .find((environment) => environment.projectId === command.projectId)?.id;
        selectedTestId = store.listTests().find((test) => test.projectId === command.projectId)?.id;
        if (selectedTestId) {
          const { selectedTest } = selectedContext();
          if (selectedTest) session.load(selectedTest.title, store.loadSteps(selectedTest.id));
        } else session.load('recorded test', []);
        break;
      case 'select-environment':
        selectedEnvironmentId = command.environmentId;
        applyContext();
        break;
      case 'select-test': {
        const test = store.listTests().find((candidate) => candidate.id === command.testId);
        if (!test) break;
        selectedTestId = test.id;
        selectedProjectId = test.projectId;
        selectedEnvironmentId = test.environmentId;
        session.load(test.title, store.loadSteps(test.id));
        break;
      }
      case 'copy-source':
        clipboard.writeText(session.snapshot().source);
        session.warn('Playwright source copied to the clipboard.');
        break;
      case 'export-source': {
        const { selectedTest } = selectedContext();
        const basename = (selectedTest?.title ?? 'testron-test')
          .replace(/[^a-z0-9]+/gi, '-')
          .replace(/^-|-$/g, '')
          .toLowerCase();
        const filename = `${basename || 'testron-test'}.spec.ts`;
        void dialog
          .showSaveDialog(mainWindow!, {
            title: 'Export Playwright test',
            defaultPath: filename,
            filters: [{ name: 'Playwright TypeScript', extensions: ['ts'] }],
          })
          .then(async (result) => {
            if (!result.canceled && result.filePath) {
              await writeFile(result.filePath, session.snapshot().source, 'utf8');
              session.warn(`Exported ${path.basename(result.filePath)}.`);
            }
          })
          .catch((error: unknown) =>
            session.warn(error instanceof Error ? error.message : 'Could not export test.'),
          );
        break;
      }
    }
    if (!['request-snapshot', 'copy-source', 'export-source'].includes(command.type))
      sendSnapshot(session.snapshot());
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
  const dataDirectory = process.env.TESTRON_DATA_DIR ?? app.getPath('userData');
  repository = new TestronRepository(path.join(dataDirectory, 'testron.sqlite'));
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('before-quit', () => {
  repository?.close();
  repository = undefined;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
