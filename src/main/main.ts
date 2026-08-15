import path from 'node:path';
import { existsSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';

import { app, BrowserWindow, clipboard, dialog, ipcMain, WebContentsView } from 'electron';
import { z } from 'zod';

import { recorderCandidateSchema } from '../domain/recording/schema';
import { stepSchema } from '../domain/steps/schema';
import type { AppCommand, VerifyAssertion } from '../preload/api';
import {
  recordLayoutSchema,
  recordPanelEventSchema,
  recordPanelStateSchema,
  type PanelId,
  type RecordLayout,
} from '../preload/record';
import { TestronRepository } from './persistence/repository';
import { RecordingSession } from './recording/session';
import { LocalReplayRunner, type ReplaySnapshot } from './replay/runner';
import {
  APP_CHANNELS,
  APP_RENDERER_WEB_PREFERENCES,
  RECORD_CHANNELS,
  RECORDER_CHANNEL,
  RECORDER_CONFIG_CHANNEL,
  TESTED_WEBSITE_WEB_PREFERENCES,
} from './security';

const TOOLBAR_HEIGHT = 430;

const PANEL_IDS = ['steps', 'code'] as const;
const PANEL_ROUTES: Record<PanelId, string> = { steps: 'panel/steps', code: 'panel/code' };
const OFF_WINDOW = { x: 0, y: 0, width: 0, height: 0 } as const;

const idleRecordLayout = (): RecordLayout => ({
  plane: null,
  panels: { steps: { visible: false, width: 25 }, code: { visible: false, width: 25 } },
  resizing: null,
});
const appCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set-shell-route'), route: z.enum(['dashboard', 'recorder']) }),
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
  z.object({ type: z.literal('duplicate-step'), index: z.number().int().nonnegative() }),
  z.object({
    type: z.literal('update-step'),
    index: z.number().int().nonnegative(),
    step: stepSchema,
  }),
  z.object({
    type: z.literal('use-alternative-locator'),
    index: z.number().int().nonnegative(),
    alternativeIndex: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('set-capture-mode'),
    mode: z.enum(['record', 'verify']),
    assertion: z.enum([
      'visible',
      'hidden',
      'textContains',
      'textEquals',
      'value',
      'enabled',
      'disabled',
      'checked',
      'unchecked',
    ]),
  }),
  z.object({ type: z.literal('add-url-path-assertion'), expected: z.string().startsWith('/') }),
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
  z.object({
    type: z.literal('run-test'),
    environmentVariables: z.record(z.string().regex(/^[A-Z][A-Z0-9_]*$/), z.string()),
    timeoutMs: z.number().int().min(1_000).max(600_000),
    reuseAuthState: z.boolean(),
  }),
  z.object({ type: z.literal('cancel-run') }),
  z.object({ type: z.literal('clear-auth-state') }),
  z.object({ type: z.literal('set-record-layout'), layout: recordLayoutSchema }),
  z.object({ type: z.literal('publish-record-state'), state: recordPanelStateSchema }),
]);

let mainWindow: BrowserWindow | undefined;
let websiteView: WebContentsView | undefined;
let panelViews = new Map<PanelId, WebContentsView>();
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
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: '#dcebed',
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

  /**
   * The step and spec panels are views of their own, added after the website
   * view so they composite above it, and painted on a transparent background
   * so the page shows through their tint.
   *
   * They are app renderers — same preload, same origin, same sandbox as the
   * main window — reached at their own hash routes. They talk to the record
   * screen only through the relay below.
   */
  for (const id of PANEL_IDS) {
    const view = new WebContentsView({
      webPreferences: {
        ...APP_RENDERER_WEB_PREFERENCES,
        preload: path.join(__dirname, 'app.js'),
      },
    });
    view.setBackgroundColor('#00000000');
    view.setBounds(OFF_WINDOW);
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.contentView.addChildView(view);
    panelViews.set(id, view);
  }

  let shellRoute: 'dashboard' | 'recorder' = 'dashboard';
  let recordLayout = idleRecordLayout();

  /**
   * One arithmetic pass over the whole stack. The record screen measures the
   * rectangle it wants the page to fill and sends it here; the panels are cut
   * out of that same rectangle, so the three views can never disagree about
   * where the browser plane is.
   */
  const layout = (): void => {
    const [width, height] = mainWindow?.getContentSize() ?? [0, 0];
    const plane = recordLayout.plane;

    if (plane) {
      websiteView?.setBounds({
        x: plane.x,
        y: plane.y,
        width: Math.min(plane.width, Math.max(0, width - plane.x)),
        height: Math.min(plane.height, Math.max(0, height - plane.y)),
      });
    } else {
      websiteView?.setBounds({
        x: 0,
        y: shellRoute === 'recorder' ? TOOLBAR_HEIGHT : height,
        width,
        height: shellRoute === 'recorder' ? Math.max(0, height - TOOLBAR_HEIGHT) : 0,
      });
    }

    for (const [id, view] of panelViews) {
      const panel = recordLayout.panels[id];
      if (!plane || !panel.visible) {
        view.setBounds(OFF_WINDOW);
        continue;
      }
      // Mid-drag the panel owns the whole plane: the pointer stays inside one
      // view, and the transparent remainder shields the page from stray clicks.
      if (recordLayout.resizing === id) {
        view.setBounds(plane);
        continue;
      }
      const panelWidth = Math.round((plane.width * panel.width) / 100);
      view.setBounds({
        x: id === 'steps' ? plane.x : plane.x + plane.width - panelWidth,
        y: plane.y,
        width: panelWidth,
        height: plane.height,
      });
    }
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
  const runner = new LocalReplayRunner();
  let replaySnapshot: ReplaySnapshot = { status: 'idle', steps: [] };
  const sendSnapshot = (snapshot: ReturnType<RecordingSession['snapshot']>): void => {
    const window = mainWindow;
    if (window && !window.isDestroyed())
      window.webContents.send(APP_CHANNELS.snapshot, {
        ...snapshot,
        library: librarySnapshot(),
        replay: replaySnapshot,
      });
  };
  const session = new RecordingSession(sendSnapshot, (steps) => {
    if (selectedTestId) store.replaceSteps(selectedTestId, steps);
  });
  let verifyAssertion: VerifyAssertion = 'visible';

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
        captureMode: session.snapshot().captureMode,
        assertion: verifyAssertion,
      });
    }
  };
  if (selectedTestId) {
    const { selectedTest } = selectedContext();
    if (selectedTest) session.load(selectedTest.title, store.loadSteps(selectedTest.id));
  }

  websiteView.webContents.setWindowOpenHandler(({ url, disposition }) => {
    session.warn(`Blocked ${disposition} popup to ${url}. Popups are not recorded yet.`);
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
      captureMode: session.snapshot().captureMode,
      assertion: verifyAssertion,
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
      case 'set-shell-route':
        shellRoute = command.route;
        layout();
        break;
      case 'start-recording':
        session.start();
        applyContext();
        break;
      case 'stop-recording':
        session.stop();
        break;
      case 'pause-recording':
        session.pause();
        break;
      case 'resume-recording':
        session.resume();
        applyContext();
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
      case 'duplicate-step':
        session.duplicateStep(command.index);
        break;
      case 'update-step':
        session.updateStep(command.index, command.step);
        break;
      case 'use-alternative-locator':
        session.useAlternativeLocator(command.index, command.alternativeIndex);
        break;
      case 'set-capture-mode':
        verifyAssertion = command.assertion;
        session.setCaptureMode(command.mode);
        applyContext();
        break;
      case 'add-url-path-assertion':
        session.addUrlAssertion(command.expected);
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
      case 'run-test': {
        if (replaySnapshot.status === 'running') break;
        const { selectedTest, environment } = selectedContext();
        if (!selectedTest || !environment) {
          session.warn('Select a saved test and environment before running.');
          break;
        }
        const dataDirectory = process.env.TESTRON_DATA_DIR ?? app.getPath('userData');
        const authStatePath = path.join(
          dataDirectory,
          'auth',
          `${environment.id}-revision-${environment.authRevision}.json`,
        );
        const artifactsDirectory = path.join(
          dataDirectory,
          'runs',
          selectedTest.id,
          new Date().toISOString().replaceAll(':', '-'),
        );
        const steps = store.loadSteps(selectedTest.id);
        void runner
          .run({
            steps,
            environmentVariables: command.environmentVariables,
            timeoutMs: command.timeoutMs,
            artifactsDirectory,
            ...(command.reuseAuthState && existsSync(authStatePath) ? { authStatePath } : {}),
            ...(command.reuseAuthState ? { saveAuthStatePath: authStatePath } : {}),
            onProgress: (progress) => {
              replaySnapshot = progress;
              sendSnapshot(session.snapshot());
            },
          })
          .then((result) => {
            replaySnapshot = result;
            sendSnapshot(session.snapshot());
          })
          .catch((error: unknown) => {
            replaySnapshot = {
              status: 'failed',
              steps: replaySnapshot.steps,
              error: error instanceof Error ? error.message : String(error),
            } as ReplaySnapshot;
            sendSnapshot(session.snapshot());
          });
        break;
      }
      case 'cancel-run':
        runner.cancel();
        break;
      case 'set-record-layout':
        recordLayout = command.layout;
        layout();
        break;
      case 'publish-record-state':
        for (const view of panelViews.values()) {
          if (!view.webContents.isDestroyed())
            view.webContents.send(RECORD_CHANNELS.state, command.state);
        }
        break;
      case 'clear-auth-state': {
        const { environment } = selectedContext();
        if (!environment) break;
        const dataDirectory = process.env.TESTRON_DATA_DIR ?? app.getPath('userData');
        const authStatePath = path.join(
          dataDirectory,
          'auth',
          `${environment.id}-revision-${environment.authRevision}.json`,
        );
        void rm(authStatePath, { force: true }).then(() => {
          const revision = store.rotateAuthenticationRevision(environment.id);
          session.warn(
            `Cleared local authentication state for ${environment.name}; new revision is ${revision}.`,
          );
          sendSnapshot(session.snapshot());
        });
        break;
      }
    }
    if (
      ![
        'request-snapshot',
        'copy-source',
        'export-source',
        'run-test',
        'set-record-layout',
        'publish-record-state',
      ].includes(command.type)
    )
      sendSnapshot(session.snapshot());
  });

  // Panels are not trusted to command the app — they report what the user did
  // in them, and the record screen decides what that means.
  ipcMain.on(RECORD_CHANNELS.event, (event, payload: unknown) => {
    const fromPanel = [...panelViews.values()].some((view) => view.webContents === event.sender);
    if (!fromPanel) return;
    const parsed = recordPanelEventSchema.safeParse(payload);
    if (!parsed.success) return;
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send(RECORD_CHANNELS.event, parsed.data);
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.on('closed', () => {
    ipcMain.removeAllListeners(RECORDER_CHANNEL);
    ipcMain.removeAllListeners(APP_CHANNELS.command);
    ipcMain.removeAllListeners(RECORD_CHANNELS.event);
    for (const view of panelViews.values()) view.webContents.close();
    panelViews = new Map();
    websiteView = undefined;
    mainWindow = undefined;
  });

  const loadAppRenderer = async (contents: Electron.WebContents, route?: string): Promise<void> => {
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      await contents.loadURL(
        route ? `${MAIN_WINDOW_VITE_DEV_SERVER_URL}#/${route}` : MAIN_WINDOW_VITE_DEV_SERVER_URL,
      );
      return;
    }
    const file = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);
    await contents.loadFile(file, route ? { hash: `/${route}` } : {});
  };

  await loadAppRenderer(mainWindow.webContents);

  // The panels load alongside everything else rather than ahead of it: they
  // are off-window until the record screen asks for them, and a panel that
  // arrives late announces itself and is sent the current state.
  for (const [id, view] of panelViews) {
    void loadAppRenderer(view.webContents, PANEL_ROUTES[id]).catch(() => undefined);
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
