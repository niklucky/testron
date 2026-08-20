import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  safeStorage,
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
  deleteTestSuiteRequestSchema,
  finishTestRunRequestSchema,
  getWorkspaceRequestSchema,
  lookupInviteeRequestSchema,
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
  type WorkspaceSnapshot,
} from '@testron/protocol';
import { appCommandSchema, type AppCommand, type VerifyAssertion } from '../preload/app-command';
import {
  recordPanelEventSchema,
  recordShortcutKeySchema,
  type PanelId,
  type RecordLayout,
} from '../preload/record';
import { verifyAssertionSchema } from '../preload/verify-assertion';
import { TestronRepository, type LibrarySnapshot } from './persistence/repository';
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
  z.object({ kind: z.literal('shortcut'), key: recordShortcutKeySchema }),
]);

let mainWindow: BrowserWindow | undefined;
let websiteView: WebContentsView | undefined;
let panelViews = new Map<PanelId, WebContentsView>();
let repository: TestronRepository | undefined;
let tokenStore: SecureTokenStore | undefined;
let serverClient: DesktopServerClient | undefined;
let syncCoordinator: DesktopSyncCoordinator | undefined;
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
    (remoteWorkspace?.tests ?? []).map((snapshot) => ({
      id: snapshot.test.id,
      projectId: snapshot.test.projectId,
      environmentId: snapshot.currentRevision.content.environmentId,
      testSuiteId: snapshot.test.testSuiteId,
      title: snapshot.test.title,
      createdAt: snapshot.test.createdAt,
      updatedAt: snapshot.currentRevision.createdAt,
    }));
  const allTestSuites = () => remoteWorkspace?.testSuites ?? [];
  const allProfiles = () =>
    serverState.configured
      ? (remoteWorkspace?.profiles ?? []).map((profile) => ({
          id: profile.id,
          environmentId: profile.environmentId,
          name: profile.name,
          authenticationType: profile.authenticationType,
          revision: profile.revision,
        }))
      : store.listProfiles();
  const allProfileVariables = () =>
    serverState.configured
      ? (remoteWorkspace?.profiles ?? []).flatMap((profile) =>
          profile.variables.map((variable) => ({ profileId: profile.id, ...variable })),
        )
      : store.listProfileVariables();
  const stepsFor = (testId: string): Step[] =>
    remoteTest(testId)?.currentRevision.content.steps.map(({ payload }) => payload) ?? [];
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
    (profile) => profile.environmentId === selectedEnvironmentId,
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
    if (
      !selectedProfileId ||
      !allProfiles().some(
        (profile) =>
          profile.id === selectedProfileId && profile.environmentId === selectedEnvironmentId,
      )
    )
      selectedProfileId = allProfiles().find(
        (profile) => profile.environmentId === selectedEnvironmentId,
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
    profileVariables: allProfileVariables().map(({ profileId, name, sensitive }) => ({
      profileId,
      name,
      sensitive,
    })),
    tests: allTests(),
    testSuites: allTestSuites(),
    latestTestRuns: remoteWorkspace?.latestTestRuns ?? {},
    recentRuns: remoteWorkspace?.recentRuns ?? [],
    ...(selectedProjectId ? { selectedProjectId } : {}),
    ...(selectedEnvironmentId ? { selectedEnvironmentId } : {}),
    ...(selectedTestSuiteId ? { selectedTestSuiteId } : {}),
    ...(selectedProfileId ? { selectedProfileId } : {}),
    ...(selectedTestId ? { selectedTestId } : {}),
    sync: store.getSyncSummary(),
    runsInFlight:
      remoteWorkspace?.activeRuns.filter((run) => run.projectId === selectedProjectId).length ?? 0,
    server: serverState,
  });
  const reloadRemoteWorkspace = async (): Promise<void> => {
    if (!serverClient) return;
    remoteWorkspace = await serverClient.getWorkspace(
      getWorkspaceRequestSchema.parse({ meta: requestMeta() }),
    );
    reconcileLibrarySelection();
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
    environmentId: string,
    steps: readonly Step[],
  ) => void = () => undefined;
  const session = new RecordingSession(sendSnapshot, (steps) => {
    const test = remoteTest(selectedTestId);
    if (test)
      queueTestRevision(
        test.test.id,
        session.snapshot().title,
        test.currentRevision.content.environmentId,
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
  queueTestRevision = (testId, title, environmentId, steps) => {
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
                environmentId,
                steps: reconcileRevisionSteps(canonical.currentRevision.content.steps, queuedSteps),
              },
            }),
          );
          if (result.status === 'saved') {
            replaceRemoteTest(result.snapshot);
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
        profileVariables: allProfileVariables()
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
      profileVariables: allProfileVariables()
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
          .then((testSuite) => {
            if (
              authenticationAttempt !== loginAttempt ||
              serverState.authentication !== 'signedIn' ||
              !remoteWorkspace
            )
              return;
            remoteWorkspace = {
              ...remoteWorkspace,
              testSuites: [
                ...remoteWorkspace.testSuites.filter((entry) => entry.id !== testSuite.id),
                { ...testSuite, testCount: 0, failedCount: 0, totalLatestDurationMs: 0 },
              ],
            };
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
          .then((testSuite) => {
            if (!remoteWorkspace) return;
            remoteWorkspace = {
              ...remoteWorkspace,
              testSuites: remoteWorkspace.testSuites.map((entry) =>
                entry.id === testSuite.id ? { ...entry, ...testSuite } : entry,
              ),
            };
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
          .then((testSuite) => {
            if (!remoteWorkspace) return;
            remoteWorkspace = {
              ...remoteWorkspace,
              testSuites: remoteWorkspace.testSuites.filter((entry) => entry.id !== testSuite.id),
            };
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
                environmentId: command.environmentId,
                name: command.name,
                authenticationType: command.authenticationType,
                variables: command.variables,
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
              selectedEnvironmentId = profile.environmentId;
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
        const profile = store.createProfile(command.environmentId, command.name, command.variables);
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
            environmentId: command.environmentId,
            steps: [],
          },
        });
        const authenticationAttempt = loginAttempt;
        serverState = { ...serverState, status: 'syncing', message: 'Creating test…' };
        void serverClient
          .createTest(request)
          .then((snapshot) => {
            if (authenticationAttempt !== loginAttempt || serverState.authentication !== 'signedIn')
              return;
            replaceRemoteTest(snapshot);
            selectedProjectId = snapshot.test.projectId;
            selectedEnvironmentId = snapshot.currentRevision.content.environmentId;
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
        selectedProfileId = allProfiles().find(
          (profile) => profile.environmentId === selectedEnvironmentId,
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
        selectedProfileId = allProfiles().find(
          (profile) => profile.environmentId === command.environmentId,
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
        selectedEnvironmentId = test.environmentId;
        selectedProfileId = allProfiles().find(
          (profile) => profile.environmentId === test.environmentId,
        )?.id;
        replaySnapshot = historyFor(test.id)[0] ?? { status: 'idle', steps: [] };
        session.load(test.title, stepsFor(test.id));
        break;
      }
      case 'rename-test': {
        const test = remoteTest(command.testId);
        if (!test) break;
        const steps =
          selectedTestId === test.test.id
            ? session.snapshot().steps
            : test.currentRevision.content.steps.map(({ payload }) => payload);
        queueTestRevision(
          test.test.id,
          command.title,
          test.currentRevision.content.environmentId,
          steps,
        );
        if (selectedTestId === test.test.id) session.setGenerationContext(command.title);
        break;
      }
      case 'prepare-new-test':
        selectedTestId = undefined;
        replaySnapshot = { status: 'idle', steps: [] };
        session.load(command.title, []);
        break;
      case 'save-recording': {
        session.finish();
        applyContext();
        const test = remoteTest(selectedTestId);
        if (!test) {
          session.warn('Create the server test before saving the recording.');
          break;
        }
        queueTestRevision(
          test.test.id,
          command.title,
          test.currentRevision.content.environmentId,
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
          allProfileVariables()
            .filter((variable) => variable.profileId === selectedProfileId)
            .map((variable) => [variable.name, variable.value]),
        );
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
              const finishedRun = await serverClient.finishTestRun(
                finishTestRunRequestSchema.parse({
                  meta: mutationMeta(`run-finish-${serverRun.id}`),
                  runId: serverRun.id,
                  status: result.status,
                  durationMs: result.durationMs ?? 0,
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
              error: error instanceof Error ? error.message : String(error),
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
    loginAttempt += 1;
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
  // WebContentsView starts on about:blank. Keep it there until a recorder
  // screen explicitly navigates to the selected environment; the local
  // fixture is test data, not an application startup page.
};

app.whenReady().then(async () => {
  if (process.platform === 'darwin' && existsSync(APP_ICON_PATH)) {
    app.dock?.setIcon(APP_ICON_PATH);
  }
  const dataDirectory = process.env.TESTRON_DATA_DIR ?? app.getPath('userData');
  repository = new TestronRepository(path.join(dataDirectory, 'testron.sqlite'));
  if (!localMode) {
    const serverUrl = safeUrl(__TESTRON_DEFAULT_SERVER_URL__);
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
        await tokenStore.clear();
        serverState = {
          configured: true,
          authentication: 'signedOut',
          workspace: 'loading',
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        };
      }
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
