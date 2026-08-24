import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { stripVTControlCharacters } from 'node:util';

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  safeStorage,
  session as electronSession,
  shell,
  type WebContents,
  WebContentsView,
} from 'electron';
import { z } from 'zod';

import { recorderCandidateSchema, targetObservationSchema } from '@testron/domain/recording/schema';
import { redactStepSecrets, type Step } from '@testron/domain/steps/schema';
import {
  cancelInvitationRequestSchema,
  changeAccountPasswordRequestSchema,
  createEnvironmentRequestSchema,
  createInvitationRequestSchema,
  createProfileRequestSchema,
  createProjectRequestSchema,
  createTestRequestSchema,
  createTestSuiteRequestSchema,
  deleteTestRequestSchema,
  deleteTestSuiteRequestSchema,
  finishTestRunRequestSchema,
  getWorkspaceRequestSchema,
  lookupInviteeRequestSchema,
  moveTestRequestSchema,
  respondInvitationRequestSchema,
  saveTestRevisionRequestSchema,
  startTestRunRequestSchema,
  setMemberBlockedRequestSchema,
  updateAccountProfileRequestSchema,
  updateEnvironmentRequestSchema,
  updateProjectRequestSchema,
  updateProfileRequestSchema,
  updateTestSuiteRequestSchema,
  type MutationMetadata,
  type RevisionStep,
  type TestSnapshot,
  type TestRun,
  type TestSuiteSummary,
  type WorkspaceSnapshot,
} from '@testron/protocol';
import { appCommandSchema, type AppCommand, type VerifyAssertion } from '../preload/app-command';
import { recordShortcutKeySchema } from '../preload/record';
import { verifyAssertionSchema } from '../preload/verify-assertion';
import {
  TestronRepository,
  type EnvironmentRecord,
  type LibrarySnapshot,
  type ProfileRecord,
} from './persistence/repository';
import { RecordingSession } from './recording/session';
import { LocalReplayRunner, type ReplaySnapshot } from './replay/runner';
import { BrowserInstaller } from './replay/browser-installer';
import { DesktopUpdater, type AvailableUpdate } from './update/updater';
import { DesktopSyncCoordinator, type SyncResult } from './sync/coordinator';
import { DesktopServerClient } from './sync/server-client';
import { SecureTokenStore } from './sync/token-store';
import {
  APP_CHANNELS,
  APP_RENDERER_WEB_PREFERENCES,
  RECORD_CHANNELS,
  RECORDER_CHANNEL,
  RECORDER_CONFIG_CHANNEL,
  REMOTE_APP_CHANNELS,
  TESTED_WEBSITE_WEB_PREFERENCES,
  TESTED_WEBSITE_PARTITION,
} from './security';

const APP_ICON_PATH = path.join(
  app.getAppPath(),
  'assets/brand/testron-app-icon-18-glass-t-gradient.png',
);

const OFF_WINDOW = { x: 0, y: 0, width: 0, height: 0 } as const;
const SERVER_SESSION_COOKIE = 'testron_session';

const authenticationRequired = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null || !('data' in error)) return false;
  const data = error.data;
  return (
    typeof data === 'object' && data !== null && 'code' in data && data.code === 'UNAUTHORIZED'
  );
};

const recorderControlSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('set-assertion'),
    assertion: verifyAssertionSchema,
  }),
  z.object({ kind: z.literal('repick-target'), target: targetObservationSchema }),
  z.object({ kind: z.literal('shortcut'), key: recordShortcutKeySchema }),
]);
const remoteAppCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set-locale'), locale: z.enum(['en', 'ru']) }),
  z.object({
    type: z.literal('open-local'),
    route: z.enum(['record', 'recovery']),
    projectId: z.string().uuid().optional(),
    environmentId: z.string().uuid().optional(),
    testId: z.string().uuid().optional(),
    theme: z.enum(['dark', 'light']).optional(),
  }),
  z.object({ type: z.literal('show-product') }),
  z.object({ type: z.literal('request-runtime-state') }),
  z.object({
    type: z.literal('run-test'),
    projectId: z.string().uuid(),
    environmentId: z.string().uuid().optional(),
    testId: z.string().uuid(),
    environmentVariables: z.record(z.string().regex(/^[A-Z][A-Z0-9_]*$/), z.string()),
    timeoutMs: z.number().int().min(1_000).max(600_000),
    reuseAuthState: z.boolean(),
  }),
  z.object({ type: z.literal('cancel-run') }),
  z.object({ type: z.literal('install-browser') }),
  z.object({ type: z.literal('cancel-browser-install') }),
  z.object({ type: z.literal('login'), email: z.email(), password: z.string().min(12).max(200) }),
  z.object({
    type: z.literal('register'),
    name: z.string().trim().min(1).max(100),
    email: z.email(),
    password: z.string().min(12).max(200),
  }),
]);

let mainWindow: BrowserWindow | undefined;
let remoteView: WebContentsView | undefined;
let websiteContents: WebContents | undefined;
let repository: TestronRepository | undefined;
let tokenStore: SecureTokenStore | undefined;
let webSessionToken: string | undefined;
let serverClient: DesktopServerClient | undefined;
let syncCoordinator: DesktopSyncCoordinator | undefined;
let browserInstaller: BrowserInstaller | undefined;
let remoteWorkspace: WorkspaceSnapshot | undefined;
let inviteeLookup: LibrarySnapshot['inviteeLookup'];
let accountAction: LibrarySnapshot['accountAction'];
const localMode = process.env.TESTRON_LOCAL_MODE === '1';
let serverState: NonNullable<LibrarySnapshot['server']> = {
  configured: false,
  authentication: localMode ? 'signedIn' : 'signedOut',
  workspace: localMode ? 'loaded' : 'loading',
  status: 'idle',
  ...(localMode ? {} : { message: 'A remote server URL is required before you can sign in.' }),
};

const promptForDesktopUpdate = async (): Promise<void> => {
  const window = mainWindow;
  if (!app.isPackaged || !window || window.isDestroyed()) return;

  const updater = new DesktopUpdater({
    manifestUrl: __TESTRON_UPDATE_MANIFEST_URL__,
    currentVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
  });
  let update: AvailableUpdate;
  try {
    const check = await updater.check();
    if (check.status !== 'available') return;
    update = check;
  } catch (error) {
    console.warn('Unable to check for desktop updates.', error);
    return;
  }

  const choice = await dialog.showMessageBox(window, {
    type: update.required ? 'warning' : 'info',
    title: update.required ? 'Testron update required' : 'Testron update available',
    message: `Testron ${update.version} is available.`,
    detail: update.required
      ? 'This version is required to continue using Testron.'
      : 'Download it now, or continue with the current version.',
    buttons: update.required ? ['Download update', 'Quit Testron'] : ['Download update', 'Later'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (choice.response !== 0) {
    if (update.required) app.quit();
    return;
  }

  const directory = path.join(app.getPath('userData'), 'updates', update.version);
  let downloadedPath: string;
  while (true) {
    window.setProgressBar(0.5, { mode: 'indeterminate' });
    try {
      downloadedPath = await updater.download(update, directory);
      window.setProgressBar(-1);
      break;
    } catch (error) {
      window.setProgressBar(-1);
      const failure = await dialog.showMessageBox(window, {
        type: 'error',
        title: 'Update download failed',
        message: 'Testron could not download a verified update.',
        detail: error instanceof Error ? error.message : String(error),
        buttons: update.required ? ['Retry', 'Quit Testron'] : ['Retry', 'Later'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (failure.response === 0) continue;
      if (update.required) app.quit();
      return;
    }
  }

  const ready = await dialog.showMessageBox(window, {
    type: 'info',
    title: 'Testron update downloaded',
    message: `Testron ${update.version} is ready to install.`,
    detail:
      'Open the downloaded archive, replace the current application, and launch Testron again.',
    buttons: update.required ? ['Open update and quit', 'Quit Testron'] : ['Open update', 'Later'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (ready.response === 0) {
    const openError = await shell.openPath(downloadedPath);
    if (openError) {
      shell.showItemInFolder(downloadedPath);
      await dialog.showMessageBox(window, {
        type: 'error',
        title: 'Could not open update',
        message: 'The update was downloaded, but could not be opened automatically.',
        detail: openError,
        buttons: ['OK'],
      });
    }
  }
  if (update.required) app.quit();
};

const safeUrl = (value: string): string => {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Only HTTP(S) URLs are supported.');
  return url.toString();
};

const mutationMeta = (idempotencyKey: string): MutationMetadata => ({
  protocolVersion: 1,
  requestId: randomUUID(),
  idempotencyKey,
  client: { kind: 'desktop', version: app.getVersion() },
  supportedStepVersions: [1],
});

const requestMeta = (): Omit<MutationMetadata, 'idempotencyKey'> => ({
  protocolVersion: 1,
  requestId: randomUUID(),
  client: { kind: 'desktop', version: app.getVersion() },
  supportedStepVersions: [1],
});

const createWindow = async (): Promise<void> => {
  const store = repository;
  if (!store) throw new Error('Persistence is not initialized.');
  const installer = browserInstaller;
  if (!installer) throw new Error('Browser installation service is not initialized.');
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
      webviewTag: true,
    },
  });

  const webappUrl = safeUrl(
    process.env.TESTRON_WEBAPP_URL ??
      (MAIN_WINDOW_VITE_DEV_SERVER_URL ? 'http://127.0.0.1:4402' : __TESTRON_WEBAPP_URL__),
  );
  const isWebappLocation = (url: string) => {
    try {
      return new URL(url).origin === new URL(webappUrl).origin;
    } catch {
      return false;
    }
  };
  if (!localMode) {
    remoteView = new WebContentsView({
      webPreferences: {
        ...APP_RENDERER_WEB_PREFERENCES,
        preload: path.join(__dirname, 'remote.js'),
      },
    });
    const trustedOrigin = new URL(webappUrl).origin;
    remoteView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    remoteView.webContents.on('will-navigate', (event, target) => {
      try {
        if (new URL(target).origin !== trustedOrigin) event.preventDefault();
      } catch {
        event.preventDefault();
      }
    });
  }

  let productVisible = Boolean(remoteView);
  let desktopLocale: 'en' | 'ru' = 'en';
  let remoteAttached = false;
  let sessionMenu: Menu | undefined;

  const setRemoteAttached = (attached: boolean): void => {
    if (!mainWindow || !remoteView || attached === remoteAttached) return;
    if (attached) mainWindow.contentView.addChildView(remoteView);
    else mainWindow.contentView.removeChildView(remoteView);
    remoteAttached = attached;
  };

  /** The remote product view is attached only while it owns the full window. */
  const layout = (): void => {
    const [width, height] = mainWindow?.getContentSize() ?? [0, 0];
    setRemoteAttached(productVisible);
    remoteView?.setBounds(productVisible ? { x: 0, y: 0, width, height } : OFF_WINDOW);
  };
  layout();
  mainWindow.on('resize', layout);

  const loadAppRenderer = async (
    contents: Electron.WebContents,
    route?: string,
    theme?: 'dark' | 'light',
  ): Promise<void> => {
    const query = new URLSearchParams({ locale: desktopLocale });
    if (theme) query.set('theme', theme);
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      await contents.loadURL(
        route
          ? `${MAIN_WINDOW_VITE_DEV_SERVER_URL}?${query}#/${route}`
          : `${MAIN_WINDOW_VITE_DEV_SERVER_URL}?${query}`,
      );
      return;
    }
    const file = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);
    await contents.loadFile(file, {
      query: Object.fromEntries(query),
      ...(route ? { hash: `/${route}` } : {}),
    });
  };

  const remoteTest = (id: string | undefined) =>
    remoteWorkspace?.tests.find((snapshot) => snapshot.test.id === id);
  const allProjects = () => {
    if (serverState.configured)
      return (remoteWorkspace?.projects ?? []).map(({ id, ownerId, name, url, revision }) => ({
        id,
        ownerId,
        name,
        url,
        revision,
      }));
    return store.listProjects();
  };
  const allEnvironments = () =>
    serverState.configured
      ? (remoteWorkspace?.environments ?? []).map((environment) => ({
          ...environment,
          authRevision: 1,
        }))
      : store.listEnvironments();
  const allTests = () =>
    serverState.configured
      ? (remoteWorkspace?.tests ?? []).map((snapshot) => ({
          id: snapshot.test.id,
          projectId: snapshot.test.projectId,
          environmentIds: snapshot.currentRevision.content.environmentIds,
          testSuiteId: snapshot.test.testSuiteId,
          title: snapshot.test.title,
          prerequisites: snapshot.currentRevision.content.prerequisites,
          createdAt: snapshot.test.createdAt,
          updatedAt: snapshot.currentRevision.createdAt,
        }))
      : store.listTests();
  const allTestSuites = (): TestSuiteSummary[] =>
    serverState.configured ? (remoteWorkspace?.testSuites ?? []) : [];
  const deletedTests = () =>
    (remoteWorkspace?.deletedTests ?? []).map((snapshot) => ({
      id: snapshot.test.id,
      projectId: snapshot.test.projectId,
      environmentIds: snapshot.currentRevision.content.environmentIds,
      testSuiteId: snapshot.test.testSuiteId,
      title: snapshot.test.title,
      prerequisites: snapshot.currentRevision.content.prerequisites,
      createdAt: snapshot.test.createdAt,
      updatedAt: snapshot.currentRevision.createdAt,
    }));
  const allProfiles = () =>
    serverState.configured
      ? (remoteWorkspace?.profiles ?? []).map((profile) => ({
          id: profile.id,
          projectId: profile.projectId,
          environmentIds: profile.environments.map(({ environmentId }) => environmentId),
          name: profile.name,
          authenticationType: profile.authenticationType,
          revision: profile.revision,
        }))
      : store.listProfiles();
  const allProfileVariables = () =>
    serverState.configured
      ? (remoteWorkspace?.profiles ?? []).flatMap((profile) =>
          profile.environments.flatMap((environment) =>
            environment.variables.map((variable) => ({
              profileId: profile.id,
              environmentId: environment.environmentId,
              ...variable,
            })),
          ),
        )
      : store.listProfileVariables();
  const stepsFor = (testId: string): Step[] =>
    remoteTest(testId)?.currentRevision.content.steps.map(({ payload }) => payload) ??
    store.loadSteps(testId);
  const ensureLocalProject = (projectId: string) => {
    const local = store.getProject(projectId);
    if (local) return local;
    const remote = remoteWorkspace?.projects.find((project) => project.id === projectId);
    return remote
      ? store.checkoutRemoteProject({ id: remote.id, ownerId: remote.ownerId, name: remote.name })
      : undefined;
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
  const projects = allProjects();
  const environments = allEnvironments();
  const tests = allTests();
  let selectedProjectId = projects[0]?.id;
  let selectedEnvironmentId = environments.find(
    (environment) => environment.projectId === selectedProjectId,
  )?.id;
  let selectedProfileId = allProfiles().find(
    (profile) => selectedEnvironmentId && profile.environmentIds.includes(selectedEnvironmentId),
  )?.id;
  let selectedTestId = tests.find((test) => test.projectId === selectedProjectId)?.id;
  let selectedTestSuiteId =
    tests.find((test) => test.id === selectedTestId)?.testSuiteId ??
    allTestSuites().find((suite) => suite.projectId === selectedProjectId)?.id;

  const reconcileLibrarySelection = (): void => {
    const projects = allProjects();
    if (!selectedProjectId || !projects.some((project) => project.id === selectedProjectId))
      selectedProjectId = projects[0]?.id;
    if (!selectedProjectId) {
      selectedEnvironmentId = undefined;
      selectedTestSuiteId = undefined;
      selectedProfileId = undefined;
      selectedTestId = undefined;
      return;
    }
    const environments = allEnvironments().filter(
      (environment) => environment.projectId === selectedProjectId,
    );
    if (
      !selectedTestSuiteId ||
      !allTestSuites().some(
        (suite) => suite.id === selectedTestSuiteId && suite.projectId === selectedProjectId,
      )
    )
      selectedTestSuiteId = allTestSuites().find(
        (suite) => suite.projectId === selectedProjectId,
      )?.id;
    if (
      !selectedEnvironmentId ||
      !environments.some((environment) => environment.id === selectedEnvironmentId)
    )
      selectedEnvironmentId = environments[0]?.id;
    if (
      !selectedTestId ||
      !allTests().some((test) => test.id === selectedTestId && test.projectId === selectedProjectId)
    )
      selectedTestId = allTests().find((test) => test.projectId === selectedProjectId)?.id;
    const selectedTest = allTests().find((test) => test.id === selectedTestId);
    if (
      selectedTest &&
      (!selectedEnvironmentId || !selectedTest.environmentIds.includes(selectedEnvironmentId))
    )
      selectedEnvironmentId = selectedTest.environmentIds[0];
    if (
      !selectedProfileId ||
      !allProfiles().some(
        (profile) =>
          profile.id === selectedProfileId &&
          Boolean(selectedEnvironmentId && profile.environmentIds.includes(selectedEnvironmentId)),
      )
    )
      selectedProfileId = allProfiles().find((profile) =>
        Boolean(selectedEnvironmentId && profile.environmentIds.includes(selectedEnvironmentId)),
      )?.id;
  };

  const librarySnapshot = () => ({
    ...(remoteWorkspace?.viewer ? { viewer: remoteWorkspace.viewer } : {}),
    members: remoteWorkspace?.members ?? [],
    invitations: remoteWorkspace?.invitations ?? [],
    pendingInvitations: remoteWorkspace?.pendingInvitations ?? [],
    ...(inviteeLookup ? { inviteeLookup } : {}),
    ...(accountAction ? { accountAction } : {}),
    projects: allProjects(),
    environments: allEnvironments(),
    profiles: allProfiles(),
    profileVariables: allProfileVariables().map(
      ({ profileId, environmentId, name, sensitive }) => ({
        profileId,
        environmentId,
        name,
        sensitive,
      }),
    ),
    tests: allTests(),
    testSuites: allTestSuites(),
    deletedTests: deletedTests(),
    deletedTestSuites: remoteWorkspace?.deletedTestSuites ?? [],
    latestTestRuns: remoteWorkspace?.latestTestRuns ?? {},
    recentRuns: remoteWorkspace?.recentRuns ?? [],
    activeRuns: remoteWorkspace?.activeRuns ?? [],
    projectOverviews: remoteWorkspace?.projectOverviews ?? [],
    recentActivity: remoteWorkspace?.recentActivity ?? [],
    ...(selectedProjectId ? { selectedProjectId } : {}),
    ...(selectedEnvironmentId ? { selectedEnvironmentId } : {}),
    ...(selectedTestSuiteId ? { selectedTestSuiteId } : {}),
    ...(selectedProfileId ? { selectedProfileId } : {}),
    ...(selectedTestId ? { selectedTestId } : {}),
    sync: store.getSyncSummary(),
    runsInFlight:
      remoteWorkspace?.projectOverviews?.find((summary) => summary.projectId === selectedProjectId)
        ?.activeRunCount ??
      remoteWorkspace?.activeRuns.filter((run) => run.projectId === selectedProjectId).length ??
      0,
    server: serverState,
  });
  const reloadRemoteWorkspace = async (): Promise<void> => {
    if (!serverClient) return;
    remoteWorkspace = await serverClient.getWorkspace(
      getWorkspaceRequestSchema.parse({ meta: requestMeta() }),
    );
    reconcileLibrarySelection();
  };
  const restoreDesktopSessionFromWeb = async (): Promise<boolean> => {
    if (!tokenStore || !remoteView || remoteView.webContents.isDestroyed()) return false;
    const serverHost = new URL(__TESTRON_DEFAULT_SERVER_URL__).hostname;
    const cookie = (
      await remoteView.webContents.session.cookies.get({ name: SERVER_SESSION_COOKIE })
    ).find(({ domain }) => domain?.replace(/^\./, '') === serverHost);
    if (!cookie?.value) return false;

    webSessionToken = cookie.value;
    serverState = {
      configured: true,
      authentication: 'signedIn',
      workspace: 'loading',
      status: 'syncing',
    };
    return true;
  };
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
  const sendRuntimeState = (): void => {
    const contents = remoteView?.webContents;
    if (!contents || contents.isDestroyed()) return;
    contents.send(REMOTE_APP_CHANNELS.runtimeState, {
      replay: replaySnapshot,
      browserInstallation: installer.status(),
    });
  };
  const sendSnapshot = (snapshot: ReturnType<RecordingSession['snapshot']>): void => {
    const window = mainWindow;
    if (window && !window.isDestroyed())
      window.webContents.send(APP_CHANNELS.snapshot, {
        ...snapshot,
        library: librarySnapshot(),
        replay: replaySnapshot,
        replayHistory: historyFor(selectedTestId),
        browserInstallation: installer.status(),
        verifyAssertion,
        ...(repickIndex === undefined ? {} : { repickIndex }),
      });
    sendRuntimeState();
  };
  const reconcileRevisionSteps = (
    previous: readonly RevisionStep[],
    steps: readonly Step[],
  ): RevisionStep[] => {
    const remaining = new Set(previous.map((_, index) => index));
    return steps.map((step, index) => {
      const payload = redactStepSecrets(step);
      const serialized = JSON.stringify(payload);
      const exact = previous.findIndex(
        (entry, candidate) =>
          remaining.has(candidate) && JSON.stringify(entry.payload) === serialized,
      );
      const chosen =
        exact >= 0 ? exact : remaining.has(index) ? index : (remaining.values().next().value ?? -1);
      if (chosen >= 0) {
        remaining.delete(chosen);
        return { id: previous[chosen]!.id, payload };
      }
      return { id: randomUUID(), payload };
    });
  };
  const replaceRemoteTest = (snapshot: TestSnapshot): void => {
    if (!remoteWorkspace) return;
    remoteWorkspace = {
      ...remoteWorkspace,
      tests: [
        ...remoteWorkspace.tests.filter((entry) => entry.test.id !== snapshot.test.id),
        snapshot,
      ],
    };
  };
  let queueTestRevision: (
    testId: string,
    title: string,
    environmentIds: string[],
    steps: readonly Step[],
    prerequisites?: readonly string[],
  ) => void = () => undefined;
  const session = new RecordingSession(sendSnapshot, (steps) => {
    if (localMode && selectedTestId) {
      store.replaceSteps(selectedTestId, steps);
      return;
    }
    const test = remoteTest(selectedTestId);
    if (test)
      queueTestRevision(
        test.test.id,
        session.snapshot().title,
        test.currentRevision.content.environmentIds,
        steps,
      );
  });
  const runWorkspaceMutation = (
    operation: () => Promise<unknown>,
    pendingMessage: string,
    fallbackError: string,
  ): void => {
    const authenticationAttempt = loginAttempt;
    serverState = {
      configured: true,
      authentication: 'signedIn',
      workspace: serverState.workspace,
      status: 'syncing',
      message: pendingMessage,
    };
    sendSnapshot(session.snapshot());
    void operation()
      .then(async () => {
        if (authenticationAttempt !== loginAttempt) return;
        await reloadRemoteWorkspace();
        if (authenticationAttempt !== loginAttempt) return;
        serverState = {
          configured: true,
          authentication: 'signedIn',
          workspace: 'loaded',
          status: 'synced',
        };
        sendSnapshot(session.snapshot());
      })
      .catch((error: unknown) => {
        if (authenticationAttempt !== loginAttempt) return;
        serverState = {
          configured: true,
          authentication: 'signedIn',
          workspace: serverState.workspace,
          status: 'error',
          message: error instanceof Error ? error.message : fallbackError,
        };
        sendSnapshot(session.snapshot());
      });
  };
  let testSaveQueue = Promise.resolve();
  queueTestRevision = (testId, title, environmentIds, steps, prerequisites) => {
    const queuedSteps = structuredClone(steps);
    testSaveQueue = testSaveQueue
      .then(async () => {
        if (!serverClient || serverState.authentication !== 'signedIn')
          throw new Error('Sign in to save this recording.');
        let canonical = remoteTest(testId);
        if (!canonical) throw new Error('The server test is no longer available.');
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const result = await serverClient.saveTestRevision(
            saveTestRevisionRequestSchema.parse({
              meta: mutationMeta(`test-save-${testId}-${randomUUID()}`),
              testId,
              baseRevision: canonical.test.currentRevision,
              content: {
                stepSchemaVersion: 1,
                title,
                environmentIds,
                prerequisites: prerequisites ?? canonical.currentRevision.content.prerequisites,
                steps: reconcileRevisionSteps(canonical.currentRevision.content.steps, queuedSteps),
              },
            }),
          );
          if (result.status === 'saved') {
            replaceRemoteTest(result.snapshot);
            await reloadRemoteWorkspace();
            const state = { ...serverState };
            delete state.message;
            serverState = { ...state, status: 'synced' };
            sendSnapshot(session.snapshot());
            return;
          }
          canonical = result.current;
          replaceRemoteTest(canonical);
        }
        throw new Error('The test changed on the server. Please retry your edit.');
      })
      .catch((error: unknown) => {
        serverState = {
          ...serverState,
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        };
        session.warn(serverState.message ?? 'The recording could not be saved.');
      });
  };
  let syncRetry: ReturnType<typeof setTimeout> | undefined;
  let loginAttempt = 0;
  const applySyncResult = (result: SyncResult): void => {
    if (result.workspace) {
      remoteWorkspace = result.workspace;
      reconcileLibrarySelection();
    }
    if (syncRetry) clearTimeout(syncRetry);
    const state = { ...serverState };
    delete state.message;
    serverState = {
      ...state,
      ...(result.authenticationRequired ? { authentication: 'signedOut' as const } : {}),
      workspace: result.authenticationRequired
        ? 'loading'
        : result.workspace
          ? 'loaded'
          : state.workspace === 'loading' && result.status !== 'synced'
            ? 'unavailable'
            : state.workspace,
      status: result.status,
      ...(result.message ? { message: result.message } : {}),
    };
    if (result.authenticationRequired) {
      remoteWorkspace = undefined;
      webSessionToken = undefined;
      void tokenStore?.clear();
    } else if (result.status === 'offline' && serverState.authentication === 'signedIn')
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
      if (hydrated.workspace) {
        remoteWorkspace = hydrated.workspace;
        reconcileLibrarySelection();
      }
    }
    const flushed = await syncCoordinator.flush();
    if (flushed.status !== 'synced') {
      applySyncResult(flushed);
      return;
    }
    store.clearLegacyTests();
    // Mutations return individual resources. Refresh once after flushing so
    // every renderer snapshot is rebuilt from the canonical server workspace.
    applySyncResult(await syncCoordinator.hydrate());
  };
  const selectedContext = () => {
    const selectedTest = allTests().find((test) => test.id === selectedTestId);
    const environment = allEnvironments().find(
      (candidate) => candidate.id === (selectedEnvironmentId ?? selectedTest?.environmentIds[0]),
    );
    return { selectedTest, environment };
  };
  const selectedProfileContext = () => {
    const { environment } = selectedContext();
    const profile = allProfiles().find((candidate) => candidate.id === selectedProfileId);
    const values = environment
      ? allProfileVariables().filter(
          (variable) =>
            variable.profileId === profile?.id && variable.environmentId === environment.id,
        )
      : [];
    return { environment, profile, values };
  };
  const testedWebsiteSession = electronSession.fromPartition(TESTED_WEBSITE_PARTITION);
  testedWebsiteSession.webRequest.onBeforeSendHeaders(
    { urls: ['http://*/*', 'https://*/*'] },
    (details, callback) => {
      const { profile, values } = selectedProfileContext();
      callback({
        requestHeaders:
          profile?.authenticationType === 'headers'
            ? {
                ...details.requestHeaders,
                ...Object.fromEntries(values.map(({ name, value }) => [name, value])),
              }
            : details.requestHeaders,
      });
    },
  );
  let appliedProfileCookies: Array<{ name: string; url: string }> = [];
  let recordingAuthenticationUpdate = Promise.resolve();
  const applyRecordingAuthentication = (): Promise<void> => {
    const { environment, profile, values } = selectedProfileContext();
    recordingAuthenticationUpdate = recordingAuthenticationUpdate
      .then(async () => {
        await Promise.all(
          appliedProfileCookies.map(({ name, url }) =>
            testedWebsiteSession.cookies.remove(url, name),
          ),
        );
        appliedProfileCookies = [];
        if (!environment || profile?.authenticationType !== 'cookies') return;
        await Promise.all(
          values.map(async ({ name, value }) => {
            await testedWebsiteSession.cookies.set({ url: environment.baseUrl, name, value });
            appliedProfileCookies.push({ url: environment.baseUrl, name });
          }),
        );
      })
      .catch((error: unknown) => {
        session.warn(
          error instanceof Error
            ? `Could not apply the recording profile: ${error.message}`
            : 'Could not apply the recording profile.',
        );
        sendSnapshot(session.snapshot());
      });
    return recordingAuthenticationUpdate;
  };
  const authenticationStatePath = (
    dataDirectory: string,
    environment: EnvironmentRecord,
    profile: ProfileRecord | undefined,
  ): string =>
    path.join(
      dataDirectory,
      'auth',
      `${environment.id}-${profile?.id ?? 'no-profile'}-revision-${profile?.revision ?? environment.authRevision}.json`,
    );
  const applyContext = (): void => {
    const { selectedTest, environment } = selectedContext();
    session.setGenerationContext(selectedTest?.title ?? 'recorded test');
    if (websiteContents && !websiteContents.isDestroyed()) {
      websiteContents.send(RECORDER_CONFIG_CHANNEL, {
        testIdAttribute: environment?.testIdAttribute ?? 'data-testid',
        captureMode: session.snapshot().captureMode,
        recording: session.snapshot().recording,
        assertion: verifyAssertion,
        repicking: repickIndex !== undefined,
        profileVariables: allProfileVariables()
          .filter(
            (variable) =>
              variable.profileId === selectedProfileId &&
              variable.environmentId === environment?.id &&
              allProfiles().find((profile) => profile.id === selectedProfileId)
                ?.authenticationType === 'credentials',
          )
          .map(({ name, value }) => ({ name, value })),
      });
    }
    void applyRecordingAuthentication();
  };
  if (selectedTestId) {
    const { selectedTest } = selectedContext();
    if (selectedTest) session.load(selectedTest.title, stepsFor(selectedTest.id));
  }

  const configureWebsiteContents = (contents: WebContents): void => {
    websiteContents = contents;
    contents.setWindowOpenHandler(({ url, disposition }) => {
      session.warn(`Blocked ${disposition} popup to ${url}. Popups are not recorded yet.`);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (event, target) => {
      try {
        safeUrl(target);
      } catch {
        event.preventDefault();
        session.warn(`Blocked non-HTTP(S) navigation: ${target}`);
      }
    });
    const didNavigate = (target: string) => {
      session.navigated(target);
      applyContext();
      sendSnapshot(session.snapshot());
    };
    contents.on('did-navigate', (_event, target) => didNavigate(target));
    contents.on('did-navigate-in-page', (_event, target, isMainFrame) => {
      if (isMainFrame) didNavigate(target);
    });
    contents.on('did-fail-load', (_event, code, description, target, isMainFrame) => {
      if (isMainFrame)
        session.warn(`Could not load ${target || 'the tested page'} (${code}): ${description}`);
    });
    contents.once('destroyed', () => {
      if (websiteContents === contents) websiteContents = undefined;
    });
    applyContext();
  };

  const resetTestedWebsiteSession = async (reload: boolean): Promise<void> => {
    const contents = websiteContents;
    if (contents && !contents.isDestroyed()) contents.stop();

    await Promise.all([
      testedWebsiteSession.clearStorageData(),
      testedWebsiteSession.clearCache(),
      testedWebsiteSession.clearAuthCache(),
    ]);
    appliedProfileCookies = [];
    await applyRecordingAuthentication();

    if (
      reload &&
      contents &&
      contents === websiteContents &&
      !contents.isDestroyed() &&
      contents.getURL()
    )
      contents.reloadIgnoringCache();
  };

  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    try {
      safeUrl(params.src);
    } catch {
      event.preventDefault();
      return;
    }
    Object.assign(webPreferences, TESTED_WEBSITE_WEB_PREFERENCES, {
      preload: path.join(__dirname, 'recorder.js'),
      webviewTag: false,
    });
  });
  mainWindow.webContents.on('did-attach-webview', (_event, contents) => {
    configureWebsiteContents(contents);
  });

  ipcMain.on(RECORDER_CHANNEL, (event, payload: unknown) => {
    if (event.sender !== websiteContents || event.senderFrame !== websiteContents.mainFrame) return;
    const control = recorderControlSchema.safeParse(payload);
    if (control.success) {
      if (control.data.kind === 'shortcut') {
        if (mainWindow && !mainWindow.isDestroyed())
          mainWindow.webContents.send(RECORD_CHANNELS.event, {
            type: 'shortcut',
            key: control.data.key,
          });
      } else if (control.data.kind === 'set-assertion') {
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

  const handleAppCommand = (command: AppCommand): void => {
    switch (command.type) {
      case 'show-product':
        productVisible = Boolean(remoteView);
        if (remoteView && !isWebappLocation(remoteView.webContents.getURL()))
          void remoteView.webContents.loadURL(webappUrl).catch(() => undefined);
        layout();
        break;
      case 'show-selected-test': {
        productVisible = Boolean(remoteView);
        if (remoteView && selectedProjectId && selectedTestId) {
          const target = new URL(webappUrl);
          target.pathname = `/projects/${encodeURIComponent(selectedProjectId)}/tests/${encodeURIComponent(selectedTestId)}`;
          target.search = '';
          target.hash = '';
          void remoteView.webContents.loadURL(target.toString()).catch(() => undefined);
        }
        layout();
        break;
      }
      case 'reload-product':
        productVisible = Boolean(remoteView);
        if (remoteView) {
          if (isWebappLocation(remoteView.webContents.getURL()))
            remoteView.webContents.reloadIgnoringCache();
          else void remoteView.webContents.loadURL(webappUrl).catch(() => undefined);
        }
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
      case 'refresh-workspace':
        if (serverClient && serverState.authentication === 'signedIn')
          void serverClient
            .getWorkspace(getWorkspaceRequestSchema.parse({ meta: requestMeta() }))
            .then((workspace) => {
              remoteWorkspace = {
                ...workspace,
                latestTestRuns: {
                  ...(remoteWorkspace?.latestTestRuns ?? {}),
                  ...(workspace.latestTestRuns ?? {}),
                },
                recentRuns: workspace.recentRuns ?? remoteWorkspace?.recentRuns ?? [],
              };
              reconcileLibrarySelection();
              sendSnapshot(session.snapshot());
            })
            .catch((error: unknown) => {
              serverState = {
                ...serverState,
                status: 'error',
                message:
                  error instanceof Error ? error.message : 'The workspace could not be refreshed.',
              };
              session.warn(
                error instanceof Error ? error.message : 'The workspace could not be refreshed.',
              );
              sendSnapshot(session.snapshot());
            });
        break;
      case 'update-account-profile': {
        if (!serverClient || serverState.authentication !== 'signedIn') break;
        accountAction = { type: 'profile', status: 'pending' };
        sendSnapshot(session.snapshot());
        void serverClient
          .updateAccountProfile(
            updateAccountProfileRequestSchema.parse({
              meta: mutationMeta(`account-profile-${randomUUID()}`),
              name: command.name,
            }),
          )
          .then((viewer) => {
            if (!remoteWorkspace) return;
            remoteWorkspace = { ...remoteWorkspace, viewer };
            accountAction = {
              type: 'profile',
              status: 'success',
              message: 'Profile updated.',
            };
            sendSnapshot(session.snapshot());
          })
          .catch((error: unknown) => {
            accountAction = {
              type: 'profile',
              status: 'error',
              message: error instanceof Error ? error.message : 'Profile update failed.',
            };
            sendSnapshot(session.snapshot());
          });
        break;
      }
      case 'change-account-password': {
        if (!serverClient || serverState.authentication !== 'signedIn') break;
        accountAction = { type: 'password', status: 'pending' };
        sendSnapshot(session.snapshot());
        void serverClient
          .changeAccountPassword(
            changeAccountPasswordRequestSchema.parse({
              meta: mutationMeta(`account-password-${randomUUID()}`),
              currentPassword: command.currentPassword,
              newPassword: command.newPassword,
            }),
          )
          .then(() => {
            accountAction = {
              type: 'password',
              status: 'success',
              message: 'Password updated. Existing sessions remain signed in.',
            };
            sendSnapshot(session.snapshot());
          })
          .catch((error: unknown) => {
            accountAction = {
              type: 'password',
              status: 'error',
              message: error instanceof Error ? error.message : 'Password update failed.',
            };
            sendSnapshot(session.snapshot());
          });
        break;
      }
      case 'lookup-invitee': {
        if (!serverClient || serverState.authentication !== 'signedIn') break;
        inviteeLookup = undefined;
        void serverClient
          .lookupInvitee(
            lookupInviteeRequestSchema.parse({ meta: requestMeta(), email: command.email }),
          )
          .then((lookup) => {
            inviteeLookup = lookup;
            serverState = {
              configured: true,
              authentication: 'signedIn',
              workspace: serverState.workspace,
              status: 'synced',
            };
            sendSnapshot(session.snapshot());
          })
          .catch((error: unknown) => {
            serverState = {
              ...serverState,
              status: 'error',
              message: error instanceof Error ? error.message : 'User lookup failed.',
            };
            sendSnapshot(session.snapshot());
          });
        break;
      }
      case 'create-invitation': {
        if (!serverClient || serverState.authentication !== 'signedIn') break;
        runWorkspaceMutation(
          () =>
            serverClient!.createInvitation(
              createInvitationRequestSchema.parse({
                meta: mutationMeta(`invitation-create-${randomUUID()}`),
                projectId: command.projectId,
                email: command.email,
              }),
            ),
          'Sending invitation…',
          'The invitation could not be sent.',
        );
        inviteeLookup = undefined;
        break;
      }
      case 'respond-invitation': {
        if (!serverClient || serverState.authentication !== 'signedIn') break;
        runWorkspaceMutation(
          () =>
            serverClient!.respondInvitation(
              respondInvitationRequestSchema.parse({
                meta: mutationMeta(`invitation-response-${randomUUID()}`),
                invitationId: command.invitationId,
                response: command.response,
              }),
            ),
          command.response === 'accepted' ? 'Accepting invitation…' : 'Rejecting invitation…',
          'The invitation response failed.',
        );
        break;
      }
      case 'cancel-invitation': {
        if (!serverClient || serverState.authentication !== 'signedIn') break;
        runWorkspaceMutation(
          () =>
            serverClient!.cancelInvitation(
              cancelInvitationRequestSchema.parse({
                meta: mutationMeta(`invitation-cancel-${randomUUID()}`),
                invitationId: command.invitationId,
              }),
            ),
          'Cancelling invitation…',
          'The invitation could not be cancelled.',
        );
        break;
      }
      case 'set-member-blocked': {
        if (!serverClient || serverState.authentication !== 'signedIn') break;
        runWorkspaceMutation(
          () =>
            serverClient!.setMemberBlocked(
              setMemberBlockedRequestSchema.parse({
                meta: mutationMeta(`member-block-${randomUUID()}`),
                projectId: command.projectId,
                userId: command.userId,
                blocked: command.blocked,
              }),
            ),
          command.blocked ? 'Blocking member…' : 'Unblocking member…',
          'The member could not be updated.',
        );
        break;
      }
      case 'navigate':
        try {
          mainWindow?.webContents.send(APP_CHANNELS.targetUrl, safeUrl(command.url));
        } catch (error) {
          session.warn(error instanceof Error ? error.message : 'Invalid URL.');
        }
        break;
      case 'browser-navigation':
        if (!websiteContents) break;
        if (command.action === 'back' && websiteContents.navigationHistory.canGoBack())
          websiteContents.navigationHistory.goBack();
        else if (command.action === 'forward' && websiteContents.navigationHistory.canGoForward())
          websiteContents.navigationHistory.goForward();
        else if (command.action === 'reload') websiteContents.reload();
        else if (command.action === 'stop') websiteContents.stop();
        break;
      case 'create-project': {
        if (serverClient && serverState.authentication === 'signedIn') {
          const state = { ...serverState };
          delete state.message;
          serverState = {
            ...state,
            status: 'syncing',
            message: 'Creating project…',
          };
          sendSnapshot(session.snapshot());
          const request = createProjectRequestSchema.parse({
            meta: {
              protocolVersion: 1,
              requestId: randomUUID(),
              idempotencyKey: `desktop-project-create-${randomUUID()}`,
              client: { kind: 'desktop', version: app.getVersion() },
              supportedStepVersions: [1],
            },
            name: command.name,
          });
          const authenticationAttempt = loginAttempt;
          void serverClient
            .createProject(request)
            .then((project) => {
              if (
                authenticationAttempt !== loginAttempt ||
                serverState.authentication !== 'signedIn'
              )
                return;
              remoteWorkspace = {
                viewer: remoteWorkspace!.viewer,
                members: remoteWorkspace?.members ?? [],
                invitations: remoteWorkspace?.invitations ?? [],
                pendingInvitations: remoteWorkspace?.pendingInvitations ?? [],
                projects: [
                  ...(remoteWorkspace?.projects.filter((entry) => entry.id !== project.id) ?? []),
                  project,
                ],
                environments: remoteWorkspace?.environments ?? [],
                profiles: remoteWorkspace?.profiles ?? [],
                testSuites: remoteWorkspace?.testSuites ?? [],
                tests: remoteWorkspace?.tests ?? [],
                latestTestRuns: remoteWorkspace?.latestTestRuns ?? {},
                recentRuns: remoteWorkspace?.recentRuns ?? [],
                projectOverviews: [
                  ...(remoteWorkspace?.projectOverviews?.filter(
                    (summary) => summary.projectId !== project.id,
                  ) ?? []),
                  {
                    projectId: project.id,
                    suiteCount: 0,
                    testCount: 0,
                    passedCount: 0,
                    failedCount: 0,
                    noResultCount: 0,
                    runCount30d: 0,
                    activeRunCount: 0,
                    lastRunAt: null,
                    runDays: [],
                  },
                ],
                recentActivity: remoteWorkspace?.recentActivity ?? [],
                activeRuns: remoteWorkspace?.activeRuns ?? [],
              };
              selectedProjectId = project.id;
              selectedEnvironmentId = undefined;
              selectedTestSuiteId = undefined;
              selectedProfileId = undefined;
              selectedTestId = undefined;
              session.load('recorded test', []);
              serverState = {
                configured: true,
                authentication: 'signedIn',
                workspace: 'loaded',
                status: 'synced',
              };
              sendSnapshot(session.snapshot());
            })
            .catch((error: unknown) => {
              if (
                authenticationAttempt !== loginAttempt ||
                serverState.authentication !== 'signedIn'
              )
                return;
              const applicationError =
                typeof error === 'object' && error !== null && 'data' in error;
              serverState = {
                configured: true,
                authentication: 'signedIn',
                workspace: serverState.workspace,
                status: applicationError ? 'error' : 'offline',
                message: error instanceof Error ? error.message : String(error),
              };
              sendSnapshot(session.snapshot());
            });
          break;
        }
        const project = store.createProject(command.name);
        selectedProjectId = project.id;
        selectedEnvironmentId = undefined;
        selectedTestSuiteId = undefined;
        selectedProfileId = undefined;
        selectedTestId = undefined;
        session.load('recorded test', []);
        break;
      }
      case 'update-project': {
        if (!serverClient || serverState.authentication !== 'signedIn') break;
        void serverClient
          .updateProject(
            updateProjectRequestSchema.parse({
              meta: mutationMeta(`project-update-${command.projectId}-${command.baseRevision}`),
              projectId: command.projectId,
              baseRevision: command.baseRevision,
              name: command.name,
              url: command.url,
            }),
          )
          .then((project) => {
            if (!remoteWorkspace) return;
            remoteWorkspace = {
              ...remoteWorkspace,
              projects: remoteWorkspace.projects.map((entry) =>
                entry.id === project.id ? project : entry,
              ),
            };
            sendSnapshot(session.snapshot());
          })
          .catch((error: unknown) => {
            session.warn(error instanceof Error ? error.message : 'Project settings failed.');
            sendSnapshot(session.snapshot());
          });
        break;
      }
      case 'create-test-suite': {
        if (!serverClient || serverState.authentication !== 'signedIn') break;
        const authenticationAttempt = loginAttempt;
        void serverClient
          .createTestSuite(
            createTestSuiteRequestSchema.parse({
              meta: mutationMeta(`test-suite-create-${randomUUID()}`),
              projectId: command.projectId,
              name: command.name,
            }),
          )
          .then(async (testSuite) => {
            if (
              authenticationAttempt !== loginAttempt ||
              serverState.authentication !== 'signedIn' ||
              !remoteWorkspace
            )
              return;
            await reloadRemoteWorkspace();
            selectedTestSuiteId = testSuite.id;
            sendSnapshot(session.snapshot());
          })
          .catch((error: unknown) => {
            session.warn(error instanceof Error ? error.message : 'Test suite creation failed.');
            sendSnapshot(session.snapshot());
          });
        break;
      }
      case 'update-test-suite': {
        if (!serverClient || serverState.authentication !== 'signedIn') break;
        void serverClient
          .updateTestSuite(
            updateTestSuiteRequestSchema.parse({
              meta: mutationMeta(
                `test-suite-update-${command.testSuiteId}-${command.baseRevision}`,
              ),
              testSuiteId: command.testSuiteId,
              baseRevision: command.baseRevision,
              name: command.name,
            }),
          )
          .then(async () => {
            if (!remoteWorkspace) return;
            await reloadRemoteWorkspace();
            sendSnapshot(session.snapshot());
          })
          .catch((error: unknown) => {
            session.warn(error instanceof Error ? error.message : 'Test suite update failed.');
            sendSnapshot(session.snapshot());
          });
        break;
      }
      case 'delete-test-suite': {
        if (!serverClient || serverState.authentication !== 'signedIn') break;
        void serverClient
          .deleteTestSuite(
            deleteTestSuiteRequestSchema.parse({
              meta: mutationMeta(
                `test-suite-delete-${command.testSuiteId}-${command.baseRevision}`,
              ),
              testSuiteId: command.testSuiteId,
              baseRevision: command.baseRevision,
            }),
          )
          .then(async () => {
            if (!remoteWorkspace) return;
            await reloadRemoteWorkspace();
            sendSnapshot(session.snapshot());
          })
          .catch((error: unknown) => {
            session.warn(error instanceof Error ? error.message : 'Test suite deletion failed.');
            sendSnapshot(session.snapshot());
          });
        break;
      }
      case 'create-environment': {
        if (serverClient && serverState.authentication === 'signedIn') {
          serverState = {
            configured: true,
            authentication: 'signedIn',
            workspace: serverState.workspace,
            status: 'syncing',
            message: 'Creating environment…',
          };
          sendSnapshot(session.snapshot());
          const authenticationAttempt = loginAttempt;
          void serverClient
            .createEnvironment(
              createEnvironmentRequestSchema.parse({
                meta: mutationMeta(`environment-create-${randomUUID()}`),
                projectId: command.projectId,
                name: command.name,
                baseUrl: command.baseUrl,
                testIdAttribute: command.testIdAttribute,
              }),
            )
            .then((environment) => {
              if (
                authenticationAttempt !== loginAttempt ||
                serverState.authentication !== 'signedIn' ||
                !remoteWorkspace
              )
                return;
              remoteWorkspace = {
                ...remoteWorkspace,
                environments: [
                  ...remoteWorkspace.environments.filter((entry) => entry.id !== environment.id),
                  environment,
                ],
              };
              selectedProjectId = environment.projectId;
              selectedEnvironmentId = environment.id;
              selectedProfileId = undefined;
              serverState = {
                configured: true,
                authentication: 'signedIn',
                workspace: 'loaded',
                status: 'synced',
              };
              applyContext();
              sendSnapshot(session.snapshot());
            })
            .catch((error: unknown) => {
              if (
                authenticationAttempt !== loginAttempt ||
                serverState.authentication !== 'signedIn'
              )
                return;
              session.warn(error instanceof Error ? error.message : 'Environment creation failed.');
              serverState = {
                configured: true,
                authentication: 'signedIn',
                workspace: serverState.workspace,
                status: 'error',
                message: error instanceof Error ? error.message : String(error),
              };
              sendSnapshot(session.snapshot());
            });
          break;
        }
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
        void synchronize();
        break;
      }
      case 'update-environment': {
        if (!serverClient || serverState.authentication !== 'signedIn') break;
        void serverClient
          .updateEnvironment(
            updateEnvironmentRequestSchema.parse({
              meta: mutationMeta(
                `environment-update-${command.environmentId}-${command.baseRevision}`,
              ),
              environmentId: command.environmentId,
              baseRevision: command.baseRevision,
              name: command.name,
              baseUrl: command.baseUrl,
            }),
          )
          .then((environment) => {
            if (!remoteWorkspace) return;
            remoteWorkspace = {
              ...remoteWorkspace,
              environments: remoteWorkspace.environments.map((entry) =>
                entry.id === environment.id ? environment : entry,
              ),
            };
            sendSnapshot(session.snapshot());
          })
          .catch((error: unknown) => {
            session.warn(error instanceof Error ? error.message : 'Environment settings failed.');
            sendSnapshot(session.snapshot());
          });
        break;
      }
      case 'create-profile': {
        if (serverClient && serverState.authentication === 'signedIn') {
          void serverClient
            .createProfile(
              createProfileRequestSchema.parse({
                meta: mutationMeta(`profile-create-${randomUUID()}`),
                projectId: selectedProjectId,
                name: command.name,
                authenticationType: command.authenticationType,
                environments: [
                  { environmentId: command.environmentId, variables: command.variables },
                ],
              }),
            )
            .then((profile) => {
              if (!remoteWorkspace || serverState.authentication !== 'signedIn') return;
              remoteWorkspace = {
                ...remoteWorkspace,
                profiles: [
                  ...remoteWorkspace.profiles.filter((entry) => entry.id !== profile.id),
                  profile,
                ],
              };
              selectedEnvironmentId = command.environmentId;
              selectedProfileId = profile.id;
              applyContext();
              sendSnapshot(session.snapshot());
            })
            .catch((error: unknown) => {
              session.warn(error instanceof Error ? error.message : 'Profile creation failed.');
              sendSnapshot(session.snapshot());
            });
          break;
        }
        if (!ensureLocalEnvironment(command.environmentId)) break;
        const profile = store.createProfile(
          command.environmentId,
          command.name,
          command.authenticationType,
          command.variables,
        );
        selectedEnvironmentId = command.environmentId;
        selectedProfileId = profile.id;
        applyContext();
        break;
      }
      case 'update-profile': {
        if (!serverClient || serverState.authentication !== 'signedIn') break;
        void serverClient
          .updateProfile(
            updateProfileRequestSchema.parse({
              meta: mutationMeta(`profile-update-${command.profileId}-${command.baseRevision}`),
              profileId: command.profileId,
              baseRevision: command.baseRevision,
              name: command.name,
              authenticationType: command.authenticationType,
              environmentId: command.environmentId,
              variables: command.variables,
            }),
          )
          .then((profile) => {
            if (!remoteWorkspace) return;
            remoteWorkspace = {
              ...remoteWorkspace,
              profiles: remoteWorkspace.profiles.map((entry) =>
                entry.id === profile.id ? profile : entry,
              ),
            };
            selectedProfileId = profile.id;
            applyContext();
            sendSnapshot(session.snapshot());
          })
          .catch((error: unknown) => {
            session.warn(error instanceof Error ? error.message : 'Profile update failed.');
            sendSnapshot(session.snapshot());
          });
        break;
      }
      case 'create-test': {
        if (!serverClient || serverState.authentication !== 'signedIn') {
          if (localMode) {
            const test = store.createTest(
              command.projectId,
              command.environmentIds,
              command.title,
              selectedTestSuiteId,
            );
            selectedProjectId = test.projectId;
            selectedEnvironmentId = test.environmentIds[0];
            selectedTestId = test.id;
            replaySnapshot = { status: 'idle', steps: [] };
            session.load(test.title, []);
            applyContext();
            break;
          }
          session.warn('Sign in before creating a test.');
          break;
        }
        const request = createTestRequestSchema.parse({
          meta: mutationMeta(`test-create-${randomUUID()}`),
          projectId: command.projectId,
          testSuiteId: selectedTestSuiteId ?? null,
          content: {
            stepSchemaVersion: 1,
            title: command.title,
            environmentIds: command.environmentIds,
            steps: [],
          },
        });
        const authenticationAttempt = loginAttempt;
        serverState = { ...serverState, status: 'syncing', message: 'Creating test…' };
        void serverClient
          .createTest(request)
          .then(async (snapshot) => {
            if (authenticationAttempt !== loginAttempt || serverState.authentication !== 'signedIn')
              return;
            replaceRemoteTest(snapshot);
            await reloadRemoteWorkspace();
            selectedProjectId = snapshot.test.projectId;
            selectedEnvironmentId = snapshot.currentRevision.content.environmentIds[0];
            selectedTestSuiteId = snapshot.test.testSuiteId ?? undefined;
            selectedTestId = snapshot.test.id;
            replaySnapshot = { status: 'idle', steps: [] };
            session.load(snapshot.test.title, []);
            const state = { ...serverState };
            delete state.message;
            serverState = { ...state, workspace: 'loaded', status: 'synced' };
            sendSnapshot(session.snapshot());
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            serverState = {
              ...serverState,
              status: 'error',
              message,
            };
            session.warn(message);
          });
        break;
      }
      case 'select-project':
        if (!allProjects().some((project) => project.id === command.projectId)) break;
        selectedProjectId = command.projectId;
        selectedEnvironmentId = allEnvironments().find(
          (environment) => environment.projectId === command.projectId,
        )?.id;
        selectedProfileId = allProfiles().find((profile) =>
          Boolean(selectedEnvironmentId && profile.environmentIds.includes(selectedEnvironmentId)),
        )?.id;
        selectedTestId = allTests().find((test) => test.projectId === command.projectId)?.id;
        selectedTestSuiteId =
          allTests().find((test) => test.id === selectedTestId)?.testSuiteId ??
          allTestSuites().find((suite) => suite.projectId === command.projectId)?.id;
        replaySnapshot = historyFor(selectedTestId)[0] ?? { status: 'idle', steps: [] };
        if (selectedTestId) {
          const { selectedTest } = selectedContext();
          if (selectedTest) session.load(selectedTest.title, stepsFor(selectedTest.id));
        } else session.load('recorded test', []);
        break;
      case 'select-test-suite':
        if (
          !allTestSuites().some(
            (suite) => suite.id === command.testSuiteId && suite.projectId === selectedProjectId,
          )
        )
          break;
        selectedTestSuiteId = command.testSuiteId;
        break;
      case 'select-environment':
        selectedEnvironmentId = command.environmentId;
        selectedProfileId = allProfiles().find((profile) =>
          profile.environmentIds.includes(command.environmentId),
        )?.id;
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
        selectedTestSuiteId =
          test.testSuiteId ??
          allTestSuites().find((suite) => suite.projectId === test.projectId)?.id;
        selectedEnvironmentId = test.environmentIds[0];
        selectedProfileId = allProfiles().find((profile) =>
          Boolean(selectedEnvironmentId && profile.environmentIds.includes(selectedEnvironmentId)),
        )?.id;
        replaySnapshot = historyFor(test.id)[0] ?? { status: 'idle', steps: [] };
        session.load(test.title, stepsFor(test.id));
        break;
      }
      case 'rename-test': {
        const test = remoteTest(command.testId);
        if (!test) {
          if (localMode && store.listTests().some((candidate) => candidate.id === command.testId)) {
            store.renameTest(command.testId, command.title);
            if (selectedTestId === command.testId) session.setGenerationContext(command.title);
          }
          break;
        }
        const steps =
          selectedTestId === test.test.id
            ? session.snapshot().steps
            : test.currentRevision.content.steps.map(({ payload }) => payload);
        queueTestRevision(
          test.test.id,
          command.title,
          command.environmentIds ?? test.currentRevision.content.environmentIds,
          steps,
        );
        if (selectedTestId === test.test.id) session.setGenerationContext(command.title);
        break;
      }
      case 'replace-prerequisites': {
        const test = remoteTest(command.testId);
        if (!test) {
          if (localMode && store.listTests().some((candidate) => candidate.id === command.testId))
            store.replacePrerequisites(command.testId, command.prerequisites);
          break;
        }
        const steps =
          selectedTestId === test.test.id
            ? session.snapshot().steps
            : test.currentRevision.content.steps.map(({ payload }) => payload);
        queueTestRevision(
          test.test.id,
          test.test.title,
          test.currentRevision.content.environmentIds,
          steps,
          command.prerequisites,
        );
        break;
      }
      case 'delete-test': {
        const test = remoteTest(command.testId);
        if (!test || !serverClient || serverState.authentication !== 'signedIn') break;
        void serverClient
          .deleteTest(
            deleteTestRequestSchema.parse({
              meta: mutationMeta(
                `test-delete-${command.testId}-${test.test.currentRevision.number}`,
              ),
              testId: command.testId,
              baseRevision: test.test.currentRevision,
            }),
          )
          .then(async () => {
            if (!remoteWorkspace) return;
            await reloadRemoteWorkspace();
            sendSnapshot(session.snapshot());
            productVisible = Boolean(remoteView);
            if (remoteView) {
              if (isWebappLocation(remoteView.webContents.getURL()))
                remoteView.webContents.reloadIgnoringCache();
              else void remoteView.webContents.loadURL(webappUrl).catch(() => undefined);
            }
            layout();
          })
          .catch((error: unknown) => {
            session.warn(error instanceof Error ? error.message : 'Test deletion failed.');
            sendSnapshot(session.snapshot());
          });
        break;
      }
      case 'move-test': {
        const test = remoteTest(command.testId);
        if (!test || !serverClient || serverState.authentication !== 'signedIn') break;
        void serverClient
          .moveTest(
            moveTestRequestSchema.parse({
              meta: mutationMeta(
                `test-move-${command.testId}-${test.test.currentRevision.number}-${command.testSuiteId}`,
              ),
              testId: command.testId,
              baseRevision: test.test.currentRevision,
              projectId: command.projectId,
              testSuiteId: command.testSuiteId,
              environmentIds: command.environmentIds,
            }),
          )
          .then(async (moved) => {
            selectedProjectId = moved.test.projectId;
            selectedTestSuiteId = moved.test.testSuiteId ?? undefined;
            selectedEnvironmentId = moved.currentRevision.content.environmentIds[0];
            selectedTestId = moved.test.id;
            session.load(
              moved.test.title,
              moved.currentRevision.content.steps.map(({ payload }) => payload),
            );
            await reloadRemoteWorkspace();
            sendSnapshot(session.snapshot());
            if (remoteView && isWebappLocation(remoteView.webContents.getURL()))
              remoteView.webContents.reloadIgnoringCache();
          })
          .catch((error: unknown) => {
            session.warn(error instanceof Error ? error.message : 'Test move failed.');
            sendSnapshot(session.snapshot());
          });
        break;
      }
      case 'prepare-new-test':
        selectedTestId = undefined;
        replaySnapshot = { status: 'idle', steps: [] };
        session.load(command.title, []);
        void resetTestedWebsiteSession(true).catch((error: unknown) => {
          session.warn(error instanceof Error ? error.message : 'Browser session reset failed.');
          sendSnapshot(session.snapshot());
        });
        break;
      case 'save-recording': {
        session.finish();
        applyContext();
        const test = remoteTest(selectedTestId);
        if (!test) {
          if (localMode && selectedProjectId && selectedEnvironmentId) {
            const steps = session.snapshot().steps;
            const localTest = selectedTestId
              ? store.listTests().find((candidate) => candidate.id === selectedTestId)
              : undefined;
            if (localTest) store.renameTest(localTest.id, command.title);
            const saved =
              localTest ??
              store.createTest(
                selectedProjectId,
                [selectedEnvironmentId],
                command.title,
                selectedTestSuiteId,
              );
            store.replaceSteps(saved.id, steps);
            selectedTestId = saved.id;
            session.load(command.title, steps);
            replaySnapshot = { status: 'idle', steps: [] };
            applyContext();
            break;
          }
          session.warn('Create the server test before saving the recording.');
          break;
        }
        queueTestRevision(
          test.test.id,
          command.title,
          test.currentRevision.content.environmentIds,
          session.snapshot().steps,
        );
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
        if (installer.status().status !== 'ready') {
          session.warn('Chromium must be installed before running this test.');
          sendSnapshot(session.snapshot());
          break;
        }
        const { selectedTest, environment } = selectedContext();
        if (!selectedTest || !environment) {
          session.warn('Select a saved test and environment before running.');
          break;
        }
        const dataDirectory = process.env.TESTRON_DATA_DIR ?? app.getPath('userData');
        const selectedProfile = allProfiles().find((profile) => profile.id === selectedProfileId);
        const authStatePath = authenticationStatePath(dataDirectory, environment, selectedProfile);
        const artifactsDirectory = path.join(
          dataDirectory,
          'runs',
          selectedTest.id,
          new Date().toISOString().replaceAll(':', '-'),
        );
        const steps = stepsFor(selectedTest.id);
        const runTestId = selectedTest.id;
        const profileValues = allProfileVariables().filter(
          (variable) =>
            variable.profileId === selectedProfileId && variable.environmentId === environment.id,
        );
        const profileVariables =
          selectedProfile?.authenticationType === 'credentials'
            ? Object.fromEntries(profileValues.map((variable) => [variable.name, variable.value]))
            : {};
        void (async () => {
          let serverRun: TestRun | undefined;
          if (serverClient && serverState.authentication === 'signedIn') {
            try {
              const serverTestId = store.getServerId('test', runTestId) ?? runTestId;
              const serverEnvironmentId =
                store.getServerId('environment', environment.id) ?? environment.id;
              serverRun = await serverClient.startTestRun(
                startTestRunRequestSchema.parse({
                  meta: mutationMeta(`run-start-${randomUUID()}`),
                  testId: serverTestId,
                  environmentId: serverEnvironmentId,
                  ...(selectedProfileId ? { profileId: selectedProfileId } : {}),
                  source: 'desktop-local',
                }),
              );
              if (remoteWorkspace) {
                remoteWorkspace = {
                  ...remoteWorkspace,
                  activeRuns: [
                    ...remoteWorkspace.activeRuns.filter((run) => run.id !== serverRun?.id),
                    serverRun,
                  ],
                };
              }
              await reloadRemoteWorkspace();
              sendSnapshot(session.snapshot());
            } catch (error) {
              session.warn(
                error instanceof Error
                  ? `The server could not start this run: ${error.message}`
                  : 'The server could not start this run.',
              );
              sendSnapshot(session.snapshot());
              return;
            }
          }

          const finishServerRun = async (result: ReplaySnapshot): Promise<void> => {
            if (
              !serverRun ||
              !serverClient ||
              result.status === 'idle' ||
              result.status === 'running'
            )
              return;
            try {
              const error =
                result.steps.find((step) => step.status === 'failed')?.error ?? result.error;
              const finishedRun = await serverClient.finishTestRun(
                finishTestRunRequestSchema.parse({
                  meta: mutationMeta(`run-finish-${serverRun.id}`),
                  runId: serverRun.id,
                  status: result.status,
                  durationMs: result.durationMs ?? 0,
                  ...(error ? { error: stripVTControlCharacters(error).slice(0, 10_000) } : {}),
                }),
              );
              if (remoteWorkspace)
                remoteWorkspace = {
                  ...remoteWorkspace,
                  activeRuns: remoteWorkspace.activeRuns.filter((run) => run.id !== serverRun?.id),
                  latestTestRuns: {
                    ...(remoteWorkspace.latestTestRuns ?? {}),
                    ...(finishedRun.status === 'running' || finishedRun.durationMs === null
                      ? {}
                      : {
                          [finishedRun.testId]: {
                            status: finishedRun.status,
                            durationMs: finishedRun.durationMs,
                            startedAt: finishedRun.startedAt,
                          },
                        }),
                  },
                  recentRuns:
                    finishedRun.status === 'running'
                      ? (remoteWorkspace.recentRuns ?? [])
                      : [
                          finishedRun,
                          ...(remoteWorkspace.recentRuns ?? []).filter(
                            (run) => run.id !== finishedRun.id,
                          ),
                        ].slice(0, 200),
                };
              await reloadRemoteWorkspace();
            } catch (error) {
              session.warn(
                error instanceof Error
                  ? `The server could not finish this run: ${error.message}`
                  : 'The server could not finish this run.',
              );
            }
          };

          try {
            const result = await runner.run({
              steps,
              environmentVariables: { ...profileVariables, ...command.environmentVariables },
              timeoutMs: command.timeoutMs,
              artifactsDirectory,
              ...(command.reuseAuthState && existsSync(authStatePath) ? { authStatePath } : {}),
              ...(command.reuseAuthState ? { saveAuthStatePath: authStatePath } : {}),
              ...(selectedProfile?.authenticationType === 'cookies'
                ? {
                    cookies: profileValues.map(({ name, value }) => ({
                      name,
                      value,
                      url: environment.baseUrl,
                    })),
                  }
                : {}),
              ...(selectedProfile?.authenticationType === 'headers'
                ? {
                    headers: Object.fromEntries(
                      profileValues.map(({ name, value }) => [name, value]),
                    ),
                  }
                : {}),
              onProgress: (progress) => {
                replaySnapshot = progress;
                rememberReplay(runTestId, progress);
                sendSnapshot(session.snapshot());
              },
            });
            replaySnapshot = result;
            rememberReplay(runTestId, result);
            await finishServerRun(result);
            sendSnapshot(session.snapshot());
          } catch (error) {
            replaySnapshot = {
              status: 'failed',
              steps: replaySnapshot.steps,
              startedAt: replaySnapshot.startedAt,
              durationMs: replaySnapshot.durationMs,
              error: stripVTControlCharacters(
                error instanceof Error ? error.message : String(error),
              ),
            } as ReplaySnapshot;
            rememberReplay(runTestId, replaySnapshot);
            await finishServerRun(replaySnapshot);
            sendSnapshot(session.snapshot());
          }
        })();
        break;
      }
      case 'cancel-run':
        runner.cancel();
        break;
      case 'install-browser':
        void installer.install(() => sendSnapshot(session.snapshot()));
        break;
      case 'cancel-browser-install':
        installer.cancel();
        break;
      case 'set-record-layout':
        // The tested page and panels are DOM children of RecordScreen now.
        break;
      case 'publish-record-state':
        // Panels now render in the record renderer and share its state.
        break;
      case 'clear-auth-state': {
        const { environment } = selectedContext();
        if (!environment) break;
        const dataDirectory = process.env.TESTRON_DATA_DIR ?? app.getPath('userData');
        const selectedProfile = allProfiles().find((profile) => profile.id === selectedProfileId);
        const authStatePath = authenticationStatePath(dataDirectory, environment, selectedProfile);
        void rm(authStatePath, { force: true }).then(() => {
          const revision = store.rotateAuthenticationRevision(environment.id);
          session.warn(
            `Cleared local authentication state for ${environment.name}; new revision is ${revision}.`,
          );
          sendSnapshot(session.snapshot());
        });
        break;
      }
      case 'login-server':
      case 'register-server': {
        if (!serverClient || !tokenStore) {
          session.warn('The configured server is unavailable.');
          break;
        }
        const attempt = ++loginAttempt;
        inviteeLookup = undefined;
        accountAction = undefined;
        serverState = {
          configured: true,
          authentication: 'authenticating',
          workspace: 'loading',
          status: 'syncing',
          message: command.type === 'login-server' ? 'Signing in…' : 'Creating your account…',
        };
        sendSnapshot(session.snapshot());
        const operation =
          command.type === 'login-server'
            ? serverClient.login(command.email, command.password)
            : serverClient.register(command.name, command.email, command.password);
        void operation
          .then(async (result) => {
            if (attempt !== loginAttempt) return;
            await tokenStore!.save(result.accessToken);
            if (attempt !== loginAttempt) return;
            const workspace = await serverClient!.getWorkspace(
              getWorkspaceRequestSchema.parse({ meta: requestMeta() }),
            );
            if (attempt !== loginAttempt) return;
            remoteWorkspace = workspace;
            reconcileLibrarySelection();
            serverState = {
              configured: true,
              authentication: 'signedIn',
              workspace: 'loaded',
              status: 'idle',
            };
            sendSnapshot(session.snapshot());
          })
          .catch(async (error: unknown) => {
            if (attempt !== loginAttempt) return;
            remoteWorkspace = undefined;
            await tokenStore!.clear();
            if (attempt !== loginAttempt) return;
            serverState = {
              configured: true,
              authentication: 'signedOut',
              workspace: 'loading',
              status: 'error',
              message: error instanceof Error ? error.message : String(error),
            };
            sendSnapshot(session.snapshot());
          });
        break;
      }
      case 'logout-server':
        loginAttempt += 1;
        remoteWorkspace = undefined;
        webSessionToken = undefined;
        inviteeLookup = undefined;
        accountAction = undefined;
        serverState = {
          configured: Boolean(serverClient),
          authentication: 'signedOut',
          workspace: 'loading',
          status: 'idle',
        };
        void tokenStore?.clear();
        break;
      case 'sync-now':
        void synchronize(true);
        break;
      case 'show-session-menu': {
        sessionMenu?.closePopup(mainWindow);
        const menu = Menu.buildFromTemplate(
          command.items.map((item) => ({
            label: item.name,
            type: 'radio' as const,
            checked: item.id === command.selectedId,
            click: () =>
              mainWindow?.webContents.send(APP_CHANNELS.sessionMenuSelection, {
                menu: command.menu,
                id: item.id,
              }),
          })),
        );
        sessionMenu = menu;
        menu.popup({
          window: mainWindow,
          x: command.x,
          y: command.y,
          callback: () => {
            if (sessionMenu === menu) sessionMenu = undefined;
          },
        });
        break;
      }
    }
    if (
      ![
        'request-snapshot',
        'navigate',
        'browser-navigation',
        'copy-source',
        'export-source',
        'run-test',
        'show-session-menu',
        'set-record-layout',
        'publish-record-state',
      ].includes(command.type)
    )
      sendSnapshot(session.snapshot());
  };

  ipcMain.on(APP_CHANNELS.command, (event, payload: unknown) => {
    if (event.sender !== mainWindow?.webContents) return;
    const parsed = appCommandSchema.safeParse(payload);
    if (!parsed.success) return;
    handleAppCommand(parsed.data);
  });

  ipcMain.on(REMOTE_APP_CHANNELS.command, (event, payload: unknown) => {
    if (
      event.sender !== remoteView?.webContents ||
      event.senderFrame !== remoteView.webContents.mainFrame
    )
      return;
    const parsed = remoteAppCommandSchema.safeParse(payload);
    if (!parsed.success) return;
    const command = parsed.data;

    if (command.type === 'set-locale') {
      desktopLocale = command.locale;
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send(APP_CHANNELS.locale, desktopLocale);
      return;
    }

    if (command.type === 'show-product') {
      productVisible = true;
      if (!isWebappLocation(remoteView.webContents.getURL()))
        void remoteView.webContents.loadURL(webappUrl).catch(() => undefined);
      layout();
      return;
    }

    if (command.type === 'login' || command.type === 'register') {
      if (!serverClient || !tokenStore) return;
      const attempt = ++loginAttempt;
      const operation =
        command.type === 'login'
          ? serverClient.login(command.email, command.password)
          : serverClient.register(command.name, command.email, command.password);
      void operation
        .then(async (result) => {
          if (attempt !== loginAttempt) return;
          await tokenStore!.save(result.accessToken);
          if (attempt !== loginAttempt) return;
          await reloadRemoteWorkspace();
          serverState = {
            configured: true,
            authentication: 'signedIn',
            workspace: 'loaded',
            status: 'idle',
          };
        })
        .catch(async () => {
          if (attempt !== loginAttempt) return;
          await tokenStore!.clear();
          serverState = {
            configured: true,
            authentication: 'signedOut',
            workspace: 'loading',
            status: 'error',
            message: 'Desktop authentication failed.',
          };
        });
      return;
    }

    if (command.type === 'request-runtime-state') {
      sendRuntimeState();
      return;
    }
    if (command.type === 'cancel-run') {
      handleAppCommand({ type: 'cancel-run' });
      return;
    }
    if (command.type === 'install-browser') {
      handleAppCommand({ type: 'install-browser' });
      return;
    }
    if (command.type === 'cancel-browser-install') {
      handleAppCommand({ type: 'cancel-browser-install' });
      return;
    }

    void (async () => {
      try {
        if (serverState.authentication !== 'signedIn') await restoreDesktopSessionFromWeb();
        if (serverClient && serverState.authentication === 'signedIn')
          await reloadRemoteWorkspace();
        if (
          command.type === 'open-local' &&
          command.route === 'record' &&
          !localMode &&
          !remoteWorkspace
        )
          throw new Error('The recorder workspace is unavailable. Please sign in again.');
        if (command.projectId) selectedProjectId = command.projectId;
        if (command.environmentId) selectedEnvironmentId = command.environmentId;
        if (command.testId) selectedTestId = command.testId;
        reconcileLibrarySelection();
        const selectedTest = allTests().find((test) => test.id === selectedTestId);
        if (selectedTest) {
          selectedProjectId = selectedTest.projectId;
          if (
            !selectedEnvironmentId ||
            !selectedTest.environmentIds.includes(selectedEnvironmentId)
          )
            selectedEnvironmentId = selectedTest.environmentIds[0];
          selectedTestSuiteId = selectedTest.testSuiteId ?? undefined;
          selectedProfileId = allProfiles().find((profile) =>
            Boolean(
              selectedEnvironmentId && profile.environmentIds.includes(selectedEnvironmentId),
            ),
          )?.id;
          replaySnapshot = historyFor(selectedTest.id)[0] ?? { status: 'idle', steps: [] };
          session.load(selectedTest.title, stepsFor(selectedTest.id));
        }
        if (command.type === 'run-test') {
          handleAppCommand({
            type: 'run-test',
            environmentVariables: command.environmentVariables,
            timeoutMs: command.timeoutMs,
            reuseAuthState: command.reuseAuthState,
          });
          return;
        }
        if (command.route === 'record') await resetTestedWebsiteSession(false);
        productVisible = false;
        layout();
        await loadAppRenderer(mainWindow!.webContents, command.route, command.theme);
        applyContext();
        sendSnapshot(session.snapshot());
        layout();
      } catch (error) {
        productVisible = false;
        layout();
        session.warn(error instanceof Error ? error.message : String(error));
        await loadAppRenderer(mainWindow!.webContents, 'recovery');
        layout();
      }
    })();
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.on('close', () => {
    sessionMenu?.closePopup(mainWindow);
    if (remoteView && !remoteView.webContents.isDestroyed()) remoteView.webContents.close();
  });
  mainWindow.on('closed', () => {
    sessionMenu = undefined;
    loginAttempt += 1;
    if (syncRetry) clearTimeout(syncRetry);
    ipcMain.removeAllListeners(RECORDER_CHANNEL);
    ipcMain.removeAllListeners(APP_CHANNELS.command);
    ipcMain.removeAllListeners(REMOTE_APP_CHANNELS.command);
    ipcMain.removeAllListeners(RECORD_CHANNELS.event);
    websiteContents = undefined;
    remoteView = undefined;
    mainWindow = undefined;
  });

  await loadAppRenderer(mainWindow.webContents, localMode ? undefined : 'recovery');

  if (remoteView) {
    remoteView.webContents.on('did-fail-load', (_event, _code, _description, _url, isMainFrame) => {
      if (!isMainFrame) return;
      productVisible = false;
      void loadAppRenderer(mainWindow!.webContents, 'recovery').finally(layout);
    });
    void remoteView.webContents.loadURL(webappUrl).catch(() => {
      productVisible = false;
      layout();
    });
  }
};

app.whenReady().then(async () => {
  if (process.platform === 'darwin' && existsSync(APP_ICON_PATH)) {
    app.dock?.setIcon(APP_ICON_PATH);
  }
  const dataDirectory = process.env.TESTRON_DATA_DIR ?? app.getPath('userData');
  const browserInstallPath =
    process.env.TESTRON_BROWSERS_PATH ?? path.join(dataDirectory, 'browsers');
  process.env.PLAYWRIGHT_BROWSERS_PATH = browserInstallPath;
  const playwright = await import('@playwright/test');
  const runtimeRequire = createRequire(path.join(app.getAppPath(), 'package.json'));
  const playwrightCliPath = path
    .join(path.dirname(runtimeRequire.resolve('playwright/package.json')), 'cli.js')
    .replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
  browserInstaller = new BrowserInstaller(browserInstallPath, playwrightCliPath, {
    browserExecutablePath: () => playwright.chromium.executablePath(),
    verifyBrowser: async () => {
      const browser = await playwright.chromium.launch({ headless: true });
      await browser.close();
    },
  });
  await browserInstaller.check();
  repository = new TestronRepository(path.join(dataDirectory, 'testron.sqlite'));
  if (!localMode) {
    const serverUrl = safeUrl(__TESTRON_DEFAULT_SERVER_URL__);
    tokenStore = new SecureTokenStore(path.join(dataDirectory, 'credentials'), {
      isAvailable: () => safeStorage.isEncryptionAvailable(),
      encrypt: (value) => safeStorage.encryptString(value),
      decrypt: (value) => safeStorage.decryptString(value),
    });
    serverClient = new DesktopServerClient(
      serverUrl,
      async () => (await tokenStore!.load()) ?? webSessionToken,
    );
    syncCoordinator = new DesktopSyncCoordinator(repository, serverClient, app.getVersion());
    const token = await tokenStore.load();
    serverState = {
      configured: true,
      authentication: token ? 'signedIn' : 'signedOut',
      workspace: 'loading',
      status: 'idle',
    };
    if (token) {
      try {
        remoteWorkspace = await serverClient.getWorkspace(
          getWorkspaceRequestSchema.parse({ meta: requestMeta() }),
        );
        const legacyMigration = await syncCoordinator.flush();
        if (legacyMigration.status === 'synced') {
          repository.clearLegacyTests();
          remoteWorkspace = await serverClient.getWorkspace(
            getWorkspaceRequestSchema.parse({ meta: requestMeta() }),
          );
        }
        serverState = {
          configured: true,
          authentication: 'signedIn',
          workspace: 'loaded',
          status: legacyMigration.status === 'synced' ? 'idle' : legacyMigration.status,
          ...(legacyMigration.message ? { message: legacyMigration.message } : {}),
        };
      } catch (error) {
        remoteWorkspace = undefined;
        const signedOut = authenticationRequired(error);
        if (signedOut) {
          webSessionToken = undefined;
          await tokenStore.clear();
        }
        serverState = {
          configured: true,
          authentication: signedOut ? 'signedOut' : 'signedIn',
          workspace: signedOut ? 'loading' : 'unavailable',
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }
  await createWindow();
  void promptForDesktopUpdate();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('before-quit', () => {
  repository?.close();
  repository = undefined;
  tokenStore = undefined;
  webSessionToken = undefined;
  serverClient = undefined;
  syncCoordinator = undefined;
  browserInstaller?.cancel();
  browserInstaller = undefined;
  remoteWorkspace = undefined;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
