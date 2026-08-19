import path from 'node:path';
import { existsSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  safeStorage,
  shell,
  WebContentsView,
} from 'electron';
import { z } from 'zod';

import { recorderCandidateSchema, targetObservationSchema } from '@testron/domain/recording/schema';
import type { Step } from '@testron/domain/steps/schema';
import type { WorkspaceSnapshot } from '@testron/protocol';
import { appCommandSchema, type AppCommand, type VerifyAssertion } from '../preload/app-command';
import { recordPanelEventSchema, type PanelId, type RecordLayout } from '../preload/record';
import { verifyAssertionSchema } from '../preload/verify-assertion';
import { TestronRepository, type LibrarySnapshot, type TestRecord } from './persistence/repository';
import { RecordingSession } from './recording/session';
import { LocalReplayRunner, type ReplaySnapshot } from './replay/runner';
import { DesktopSyncCoordinator, type SyncResult } from './sync/coordinator';
import { DesktopServerClient } from './sync/server-client';
import { SecureTokenStore } from './sync/token-store';
import {
  APP_CHANNELS,
  APP_RENDERER_WEB_PREFERENCES,
  RECORD_CHANNELS,
  RECORDER_CHANNEL,
  RECORDER_CONFIG_CHANNEL,
  TESTED_WEBSITE_WEB_PREFERENCES,
} from './security';

const TOOLBAR_HEIGHT = 430;
const APP_ICON_PATH = path.join(
  app.getAppPath(),
  'assets/brand/testron-app-icon-18-glass-t-gradient.png',
);

const PANEL_IDS = ['steps', 'code'] as const;
const PANEL_ROUTES: Record<PanelId, string> = { steps: 'panel/steps', code: 'panel/code' };
const OFF_WINDOW = { x: 0, y: 0, width: 0, height: 0 } as const;

const idleRecordLayout = (): RecordLayout => ({
  plane: null,
  panels: { steps: { visible: false, width: 25 }, code: { visible: false, width: 25 } },
  resizing: null,
});
const recorderControlSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('set-assertion'),
    assertion: verifyAssertionSchema,
  }),
  z.object({ kind: z.literal('repick-target'), target: targetObservationSchema }),
]);

let mainWindow: BrowserWindow | undefined;
let websiteView: WebContentsView | undefined;
let panelViews = new Map<PanelId, WebContentsView>();
let repository: TestronRepository | undefined;
let tokenStore: SecureTokenStore | undefined;
let serverClient: DesktopServerClient | undefined;
let syncCoordinator: DesktopSyncCoordinator | undefined;
let remoteWorkspace: WorkspaceSnapshot | undefined;
let serverState: NonNullable<LibrarySnapshot['server']> = {
  configured: false,
  authentication: 'signedOut',
  status: 'idle',
};

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
    icon: existsSync(APP_ICON_PATH) ? APP_ICON_PATH : undefined,
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
      const stepsWidth = recordLayout.panels.steps.visible
        ? Math.round((plane.width * recordLayout.panels.steps.width) / 100)
        : 0;
      const codeWidth = recordLayout.panels.code.visible
        ? Math.round((plane.width * recordLayout.panels.code.width) / 100)
        : 0;
      websiteView?.setBounds({
        x: plane.x + stepsWidth,
        y: plane.y,
        width: Math.min(
          Math.max(0, plane.width - stepsWidth - codeWidth),
          Math.max(0, width - plane.x - stepsWidth),
        ),
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

  const remoteTest = (id: string | undefined) =>
    remoteWorkspace?.tests.find((snapshot) => snapshot.test.id === id);
  const allProjects = () => [
    ...store.listProjects(),
    ...(remoteWorkspace?.projects ?? [])
      .filter(
        (remote) =>
          !store
            .listProjects()
            .some((local) => store.getServerId('project', local.id) === remote.id),
      )
      .map(({ id, name }) => ({ id, name })),
  ];
  const allEnvironments = () => [
    ...store.listEnvironments(),
    ...(remoteWorkspace?.environments ?? [])
      .filter(
        (remote) =>
          !store
            .listEnvironments()
            .some((local) => store.getServerId('environment', local.id) === remote.id),
      )
      .map((environment) => ({ ...environment, authRevision: 1 })),
  ];
  const allTests = () => [
    ...store.listTests(),
    ...(remoteWorkspace?.tests ?? [])
      .filter(
        (remote) =>
          !store
            .listTests()
            .some((local) => store.getServerId('test', local.id) === remote.test.id),
      )
      .map((snapshot) => ({
        id: snapshot.test.id,
        projectId: snapshot.test.projectId,
        environmentId: snapshot.currentRevision.content.environmentId,
        title: snapshot.currentRevision.content.title,
        createdAt: snapshot.test.createdAt,
        updatedAt: snapshot.currentRevision.createdAt,
      })),
  ];
  const stepsFor = (testId: string): Step[] =>
    store.getTest(testId)
      ? store.loadSteps(testId)
      : (remoteTest(testId)?.currentRevision.content.steps.map(({ payload }) => payload) ?? []);
  const ensureLocalProject = (projectId: string) => {
    const local = store.getProject(projectId);
    if (local) return local;
    const remote = remoteWorkspace?.projects.find((project) => project.id === projectId);
    return remote ? store.checkoutRemoteProject({ id: remote.id, name: remote.name }) : undefined;
  };
  const ensureLocalEnvironment = (environmentId: string) => {
    const local = store.getEnvironment(environmentId);
    if (local) return local;
    const remote = remoteWorkspace?.environments.find(
      (environment) => environment.id === environmentId,
    );
    if (!remote || !ensureLocalProject(remote.projectId)) return undefined;
    return store.checkoutRemoteEnvironment({ ...remote, authRevision: 1 });
  };
  const ensureLocalTest = (testId: string): TestRecord | undefined => {
    const local = store.getTest(testId);
    if (local) return local;
    const snapshot = remoteTest(testId);
    if (!snapshot) return undefined;
    const project = remoteWorkspace?.projects.find((entry) => entry.id === snapshot.test.projectId);
    const environment = remoteWorkspace?.environments.find(
      (entry) => entry.id === snapshot.currentRevision.content.environmentId,
    );
    if (!project || !environment) return undefined;
    return store.checkoutRemoteTest(
      { id: project.id, name: project.name },
      { ...environment, authRevision: 1 },
      snapshot,
    );
  };
  const projects = allProjects();
  const environments = allEnvironments();
  const tests = allTests();
  let selectedProjectId = projects[0]?.id;
  let selectedEnvironmentId = environments.find(
    (environment) => environment.projectId === selectedProjectId,
  )?.id;
  let selectedProfileId = store
    .listProfiles()
    .find((profile) => profile.environmentId === selectedEnvironmentId)?.id;
  let selectedTestId = tests.find((test) => test.projectId === selectedProjectId)?.id;

  const librarySnapshot = () => ({
    projects: allProjects(),
    environments: allEnvironments(),
    profiles: store.listProfiles(),
    profileVariables: store
      .listProfileVariables()
      .map(({ profileId, name, sensitive }) => ({ profileId, name, sensitive })),
    tests: allTests(),
    ...(selectedProjectId ? { selectedProjectId } : {}),
    ...(selectedEnvironmentId ? { selectedEnvironmentId } : {}),
    ...(selectedProfileId ? { selectedProfileId } : {}),
    ...(selectedTestId ? { selectedTestId } : {}),
    sync: store.getSyncSummary(),
    server: serverState,
  });
  const runner = new LocalReplayRunner();
  let replaySnapshot: ReplaySnapshot = { status: 'idle', steps: [] };
  let verifyAssertion: VerifyAssertion = 'visible';
  let repickIndex: number | undefined;
  const replayHistory = new Map<string, ReplaySnapshot[]>();
  const historyFor = (testId: string | undefined): ReplaySnapshot[] =>
    testId ? (replayHistory.get(testId) ?? []) : [];
  const rememberReplay = (testId: string, replay: ReplaySnapshot): void => {
    if (!replay.startedAt) return;
    const history = historyFor(testId);
    const existing = history.findIndex((entry) => entry.startedAt === replay.startedAt);
    const next =
      existing >= 0
        ? history.map((entry, index) => (index === existing ? replay : entry))
        : [replay, ...history];
    replayHistory.set(testId, next.slice(0, 50));
  };
  const sendSnapshot = (snapshot: ReturnType<RecordingSession['snapshot']>): void => {
    const window = mainWindow;
    if (window && !window.isDestroyed())
      window.webContents.send(APP_CHANNELS.snapshot, {
        ...snapshot,
        library: librarySnapshot(),
        replay: replaySnapshot,
        replayHistory: historyFor(selectedTestId),
        verifyAssertion,
        ...(repickIndex === undefined ? {} : { repickIndex }),
      });
  };
  const session = new RecordingSession(sendSnapshot, (steps) => {
    if (selectedTestId && ensureLocalTest(selectedTestId))
      store.replaceSteps(selectedTestId, steps);
  });
  let syncRetry: ReturnType<typeof setTimeout> | undefined;
  const applySyncResult = (result: SyncResult): void => {
    if (result.workspace) remoteWorkspace = result.workspace;
    if (syncRetry) clearTimeout(syncRetry);
    const state = { ...serverState };
    delete state.message;
    serverState = {
      ...state,
      ...(result.authenticationRequired ? { authentication: 'signedOut' as const } : {}),
      status: result.status,
      ...(result.message ? { message: result.message } : {}),
    };
    if (result.authenticationRequired) void tokenStore?.clear();
    else if (result.status === 'offline' && serverState.authentication === 'signedIn')
      syncRetry = setTimeout(() => void synchronize(), 2_000);
    if (result.status === 'conflicted')
      session.warn(result.message ?? 'The server has a newer revision. Your local draft was kept.');
    sendSnapshot(session.snapshot());
  };
  const synchronize = async (hydrate = false): Promise<void> => {
    if (!syncCoordinator || serverState.authentication !== 'signedIn') return;
    const state = { ...serverState };
    delete state.message;
    serverState = { ...state, status: 'syncing' };
    sendSnapshot(session.snapshot());
    if (hydrate) {
      const hydrated = await syncCoordinator.hydrate();
      if (hydrated.status !== 'synced') {
        applySyncResult(hydrated);
        return;
      }
      if (hydrated.workspace) remoteWorkspace = hydrated.workspace;
    }
    applySyncResult(await syncCoordinator.flush());
  };
  const selectedContext = () => {
    const selectedTest = allTests().find((test) => test.id === selectedTestId);
    const environment = allEnvironments().find(
      (candidate) => candidate.id === (selectedTest?.environmentId ?? selectedEnvironmentId),
    );
    return { selectedTest, environment };
  };
  const applyContext = (): void => {
    const { selectedTest, environment } = selectedContext();
    session.setGenerationContext(selectedTest?.title ?? 'recorded test');
    if (websiteView && !websiteView.webContents.isDestroyed()) {
      websiteView.webContents.send(RECORDER_CONFIG_CHANNEL, {
        testIdAttribute: environment?.testIdAttribute ?? 'data-testid',
        captureMode: session.snapshot().captureMode,
        recording: session.snapshot().recording,
        assertion: verifyAssertion,
        repicking: repickIndex !== undefined,
        profileVariables: store
          .listProfileVariables()
          .filter((variable) => variable.profileId === selectedProfileId)
          .map(({ name, value }) => ({ name, value })),
      });
    }
  };
  if (selectedTestId) {
    const { selectedTest } = selectedContext();
    if (selectedTest) session.load(selectedTest.title, stepsFor(selectedTest.id));
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
      recording: session.snapshot().recording,
      assertion: verifyAssertion,
      repicking: repickIndex !== undefined,
      profileVariables: store
        .listProfileVariables()
        .filter((variable) => variable.profileId === selectedProfileId)
        .map(({ name, value }) => ({ name, value })),
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
    const control = recorderControlSchema.safeParse(payload);
    if (control.success) {
      if (control.data.kind === 'set-assertion') {
        verifyAssertion = control.data.assertion;
        applyContext();
      } else if (repickIndex !== undefined) {
        const index = repickIndex;
        repickIndex = undefined;
        session.repickTarget(index, {
          primary: control.data.target.locators[0]!,
          alternatives: control.data.target.locators.slice(1),
          ...(control.data.target.warnings?.length
            ? { warnings: control.data.target.warnings }
            : {}),
        });
        applyContext();
      }
      return;
    }
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
        replaySnapshot = { status: 'idle', steps: [] };
        session.start(command.append);
        applyContext();
        break;
      case 'stop-recording':
        session.stop();
        applyContext();
        break;
      case 'pause-recording':
        session.pause();
        applyContext();
        break;
      case 'resume-recording':
        session.resume();
        applyContext();
        break;
      case 'undo-step':
        session.undo();
        break;
      case 'redo-step':
        session.redo();
        break;
      case 'finish-recording':
        session.finish();
        applyContext();
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
      case 'replace-steps':
        session.replaceSteps(command.steps);
        break;
      case 'use-alternative-locator':
        session.useAlternativeLocator(command.index, command.alternativeIndex);
        break;
      case 'set-repick-step':
        repickIndex =
          command.index !== undefined && 'target' in (session.snapshot().steps[command.index] ?? {})
            ? command.index
            : undefined;
        applyContext();
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
      case 'browser-navigation':
        if (!websiteView) break;
        if (command.action === 'back' && websiteView.webContents.navigationHistory.canGoBack())
          websiteView.webContents.navigationHistory.goBack();
        else if (
          command.action === 'forward' &&
          websiteView.webContents.navigationHistory.canGoForward()
        )
          websiteView.webContents.navigationHistory.goForward();
        else if (command.action === 'reload') websiteView.webContents.reload();
        else if (command.action === 'stop') websiteView.webContents.stop();
        break;
      case 'create-project': {
        const project = store.createProject(command.name);
        selectedProjectId = project.id;
        selectedEnvironmentId = undefined;
        selectedProfileId = undefined;
        selectedTestId = undefined;
        session.load('recorded test', []);
        break;
      }
      case 'create-environment': {
        const baseUrl = safeUrl(command.baseUrl);
        if (!ensureLocalProject(command.projectId)) break;
        const environment = store.createEnvironment(
          command.projectId,
          command.name,
          baseUrl,
          command.testIdAttribute,
        );
        selectedProjectId = command.projectId;
        selectedEnvironmentId = environment.id;
        selectedProfileId = undefined;
        applyContext();
        break;
      }
      case 'create-profile': {
        if (!ensureLocalEnvironment(command.environmentId)) break;
        const profile = store.createProfile(command.environmentId, command.name, command.variables);
        selectedEnvironmentId = command.environmentId;
        selectedProfileId = profile.id;
        applyContext();
        break;
      }
      case 'create-test': {
        if (
          !ensureLocalProject(command.projectId) ||
          !ensureLocalEnvironment(command.environmentId)
        )
          break;
        const test = store.createTest(command.projectId, command.environmentId, command.title);
        selectedProjectId = command.projectId;
        selectedEnvironmentId = command.environmentId;
        selectedTestId = test.id;
        replaySnapshot = { status: 'idle', steps: [] };
        session.load(test.title, []);
        break;
      }
      case 'select-project':
        selectedProjectId = command.projectId;
        selectedEnvironmentId = allEnvironments().find(
          (environment) => environment.projectId === command.projectId,
        )?.id;
        selectedProfileId = store
          .listProfiles()
          .find((profile) => profile.environmentId === selectedEnvironmentId)?.id;
        selectedTestId = allTests().find((test) => test.projectId === command.projectId)?.id;
        replaySnapshot = historyFor(selectedTestId)[0] ?? { status: 'idle', steps: [] };
        if (selectedTestId) {
          const { selectedTest } = selectedContext();
          if (selectedTest) session.load(selectedTest.title, stepsFor(selectedTest.id));
        } else session.load('recorded test', []);
        break;
      case 'select-environment':
        selectedEnvironmentId = command.environmentId;
        selectedProfileId = store
          .listProfiles()
          .find((profile) => profile.environmentId === command.environmentId)?.id;
        applyContext();
        break;
      case 'select-profile':
        selectedProfileId = command.profileId;
        applyContext();
        break;
      case 'select-test': {
        const test = allTests().find((candidate) => candidate.id === command.testId);
        if (!test) break;
        selectedTestId = test.id;
        selectedProjectId = test.projectId;
        selectedEnvironmentId = test.environmentId;
        selectedProfileId = store
          .listProfiles()
          .find((profile) => profile.environmentId === test.environmentId)?.id;
        replaySnapshot = historyFor(test.id)[0] ?? { status: 'idle', steps: [] };
        session.load(test.title, stepsFor(test.id));
        break;
      }
      case 'rename-test': {
        const test = allTests().find((candidate) => candidate.id === command.testId);
        if (!test) break;
        if (!ensureLocalTest(test.id)) break;
        store.renameTest(test.id, command.title);
        if (selectedTestId === test.id) session.setGenerationContext(command.title);
        break;
      }
      case 'prepare-new-test':
        selectedTestId = undefined;
        replaySnapshot = { status: 'idle', steps: [] };
        session.load('Untitled test', []);
        break;
      case 'save-recording': {
        session.finish();
        applyContext();
        let project = allProjects().find((one) => one.id === selectedProjectId);
        if (!project) {
          project = store.createProject('My project');
          selectedProjectId = project.id;
        } else project = ensureLocalProject(project.id);
        if (!project) break;
        let environment = allEnvironments().find(
          (one) => one.id === selectedEnvironmentId && one.projectId === selectedProjectId,
        );
        if (!environment) {
          const origin = new URL(command.baseUrl).origin;
          environment = store.createEnvironment(project.id, 'Local', origin, 'data-testid');
          selectedEnvironmentId = environment.id;
        } else environment = ensureLocalEnvironment(environment.id);
        if (!project || !environment) break;
        let test = allTests().find((one) => one.id === selectedTestId);
        if (!test) {
          test = store.createTest(project.id, environment.id, command.title);
          selectedTestId = test.id;
        } else {
          test = ensureLocalTest(test.id);
          if (!test) break;
          store.renameTest(test.id, command.title);
        }
        store.replaceSteps(test.id, session.snapshot().steps);
        session.setGenerationContext(command.title);
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
        const steps = stepsFor(selectedTest.id);
        const runTestId = selectedTest.id;
        const profileVariables = Object.fromEntries(
          store
            .listProfileVariables()
            .filter((variable) => variable.profileId === selectedProfileId)
            .map((variable) => [variable.name, variable.value]),
        );
        void runner
          .run({
            steps,
            environmentVariables: { ...profileVariables, ...command.environmentVariables },
            timeoutMs: command.timeoutMs,
            artifactsDirectory,
            ...(command.reuseAuthState && existsSync(authStatePath) ? { authStatePath } : {}),
            ...(command.reuseAuthState ? { saveAuthStatePath: authStatePath } : {}),
            onProgress: (progress) => {
              replaySnapshot = progress;
              rememberReplay(runTestId, progress);
              sendSnapshot(session.snapshot());
            },
          })
          .then((result) => {
            replaySnapshot = result;
            rememberReplay(runTestId, result);
            sendSnapshot(session.snapshot());
          })
          .catch((error: unknown) => {
            replaySnapshot = {
              status: 'failed',
              steps: replaySnapshot.steps,
              startedAt: replaySnapshot.startedAt,
              durationMs: replaySnapshot.durationMs,
              error: error instanceof Error ? error.message : String(error),
            } as ReplaySnapshot;
            rememberReplay(runTestId, replaySnapshot);
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
      case 'login-server': {
        if (!serverClient || !tokenStore) {
          session.warn('Set TESTRON_SERVER_URL before signing in.');
          break;
        }
        void serverClient
          .startLogin(command.email)
          .then(async (flow) => {
            serverState = {
              ...serverState,
              authentication: 'authorizing',
              status: 'idle',
              userCode: flow.userCode,
              verificationUri: flow.verificationUri,
              message: `Enter code ${flow.userCode} in the browser.`,
            };
            sendSnapshot(session.snapshot());
            await shell.openExternal(flow.verificationUri);
            const deadline = Date.now() + flow.expiresInSeconds * 1_000;
            while (Date.now() < deadline && serverState.authentication === 'authorizing') {
              await new Promise((resolve) => setTimeout(resolve, flow.intervalSeconds * 1_000));
              const result = await serverClient!.pollLogin(flow.deviceCode);
              if (result.status === 'pending') continue;
              if (result.status === 'expired') break;
              await tokenStore!.save(result.accessToken);
              serverState = {
                configured: true,
                authentication: 'signedIn',
                status: 'idle',
              };
              await synchronize(true);
              return;
            }
            serverState = {
              configured: true,
              authentication: 'signedOut',
              status: 'error',
              message: 'The desktop sign-in request expired.',
            };
            sendSnapshot(session.snapshot());
          })
          .catch((error: unknown) => {
            serverState = {
              ...serverState,
              authentication: 'signedOut',
              status: 'offline',
              message: error instanceof Error ? error.message : String(error),
            };
            sendSnapshot(session.snapshot());
          });
        break;
      }
      case 'logout-server':
        remoteWorkspace = undefined;
        serverState = {
          configured: Boolean(serverClient),
          authentication: 'signedOut',
          status: 'idle',
        };
        void tokenStore?.clear();
        break;
      case 'sync-now':
        void synchronize(true);
        break;
    }
    if (
      [
        'create-project',
        'create-environment',
        'create-test',
        'rename-test',
        'save-recording',
        'delete-step',
        'move-step',
        'duplicate-step',
        'update-step',
        'replace-steps',
      ].includes(command.type)
    )
      void synchronize();
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
    if (syncRetry) clearTimeout(syncRetry);
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
  if (process.platform === 'darwin' && existsSync(APP_ICON_PATH)) {
    app.dock?.setIcon(APP_ICON_PATH);
  }
  const dataDirectory = process.env.TESTRON_DATA_DIR ?? app.getPath('userData');
  repository = new TestronRepository(path.join(dataDirectory, 'testron.sqlite'));
  const serverUrl = process.env.TESTRON_SERVER_URL;
  if (serverUrl) {
    tokenStore = new SecureTokenStore(path.join(dataDirectory, 'credentials'), {
      isAvailable: () => safeStorage.isEncryptionAvailable(),
      encrypt: (value) => safeStorage.encryptString(value),
      decrypt: (value) => safeStorage.decryptString(value),
    });
    serverClient = new DesktopServerClient(serverUrl, () => tokenStore!.load());
    syncCoordinator = new DesktopSyncCoordinator(repository, serverClient, app.getVersion());
    const token = await tokenStore.load();
    serverState = {
      configured: true,
      authentication: token ? 'signedIn' : 'signedOut',
      status: 'idle',
    };
    if (token) {
      const hydrated = await syncCoordinator.hydrate();
      if (hydrated.workspace) remoteWorkspace = hydrated.workspace;
      const flushed = hydrated.status === 'synced' ? await syncCoordinator.flush() : hydrated;
      const refreshed = flushed.status === 'synced' ? await syncCoordinator.hydrate() : flushed;
      if (refreshed.workspace) remoteWorkspace = refreshed.workspace;
      const result = refreshed;
      serverState = {
        ...serverState,
        ...(result.authenticationRequired ? { authentication: 'signedOut' as const } : {}),
        status: result.status,
        ...(result.message ? { message: result.message } : {}),
      };
      if (result.authenticationRequired) await tokenStore.clear();
    }
  }
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('before-quit', () => {
  repository?.close();
  repository = undefined;
  tokenStore = undefined;
  serverClient = undefined;
  syncCoordinator = undefined;
  remoteWorkspace = undefined;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
