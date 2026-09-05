import type { Step } from '@testron/domain/steps/schema';
import type {
  TestAttachment,
  DesktopRunRequest,
  DesktopAuthenticationRefreshRequest,
  DesktopAuthenticationClearRequest,
  DesktopRuntimeState,
  ProjectActivity,
  ProjectInvitation,
  ProjectMember,
  ProjectOverviewSummary,
  TestRun,
  TestSuiteSummary,
  WebWorkspaceSnapshot,
  BrowserAuthenticationFlow,
  ProfileEnvironmentAuthentication,
  ProjectSecretMetadata,
  AuthenticationStateMetadata,
  RunSchedule,
  ServerRunJob,
} from '@testron/protocol';

export interface ProjectRecord {
  id: string;
  ownerId?: string;
  name: string;
  url?: string | null;
  revision?: number;
}

export interface EnvironmentRecord {
  id: string;
  projectId: string;
  name: string;
  baseUrl: string;
  testIdAttribute: string;
  authRevision: number;
  revision?: number;
}

export interface ProfileRecord {
  id: string;
  projectId: string;
  environmentIds: string[];
  name: string;
  authenticationType: 'credentials' | 'cookies' | 'headers' | 'storage-state' | 'browser-session';
  revision?: number;
}

export interface TestRecord {
  attachments?: TestAttachment[];
  status?: 'requested' | 'ready';
  description?: string;
  id: string;
  projectId: string;
  environmentIds: string[];
  testSuiteId?: string | null;
  profileId?: string | null;
  title: string;
  prerequisites: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LibrarySnapshot {
  viewer?: WebWorkspaceSnapshot['viewer'];
  members?: ProjectMember[];
  invitations?: ProjectInvitation[];
  pendingInvitations?: ProjectInvitation[];
  inviteeLookup?: { email: string; name: string | null };
  accountAction?: {
    type: 'profile' | 'password';
    status: 'pending' | 'success' | 'error';
    message?: string;
  };
  projects: ProjectRecord[];
  environments: EnvironmentRecord[];
  profiles: ProfileRecord[];
  authenticationFlows?: BrowserAuthenticationFlow[];
  profileEnvironmentAuthentications?: ProfileEnvironmentAuthentication[];
  projectSecrets?: ProjectSecretMetadata[];
  authenticationStates?: AuthenticationStateMetadata[];
  authenticationFlowSecretNames?: Record<string, string[]>;
  profileVariables: Array<{
    profileId: string;
    environmentId: string;
    name: string;
    sensitive: boolean;
  }>;
  tests: TestRecord[];
  testSuites: TestSuiteSummary[];
  deletedTests?: TestRecord[];
  deletedTestSuites?: TestSuiteSummary[];
  latestTestRuns?: WebWorkspaceSnapshot['latestTestRuns'];
  recentRuns?: TestRun[];
  activeRuns?: TestRun[];
  runSchedules?: RunSchedule[];
  serverRunJobs?: ServerRunJob[];
  projectOverviews?: ProjectOverviewSummary[];
  recentActivity?: ProjectActivity[];
  selectedProjectId?: string;
  selectedEnvironmentId?: string;
  selectedTestSuiteId?: string;
  selectedProfileId?: string;
  selectedTestId?: string;
  sync?: { pending: number; conflicts: number };
  runsInFlight?: number;
  server?: {
    configured: boolean;
    authentication: 'signedOut' | 'authenticating' | 'signedIn';
    workspace: 'loading' | 'loaded' | 'unavailable';
    status: 'idle' | 'syncing' | 'synced' | 'offline' | 'conflicted' | 'error';
    message?: string;
  };
}

export interface AppSnapshot {
  documentMutationError?: string;
  title: string;
  recording: boolean;
  status: 'idle' | 'recording' | 'paused' | 'finished';
  currentUrl: string;
  steps: Step[];
  descriptions: string[];
  source: string;
  captureMode: 'record' | 'verify';
  stepWarnings: string[][];
  canUndo: boolean;
  canRedo: boolean;
  library: LibrarySnapshot;
  replay: ReplaySnapshot;
  replayHistory: ReplaySnapshot[];
  verifyAssertion:
    | 'visible'
    | 'hidden'
    | 'textContains'
    | 'textEquals'
    | 'value'
    | 'enabled'
    | 'disabled'
    | 'checked'
    | 'unchecked'
    | 'countExactly'
    | 'countAtLeast'
    | 'numberEquals'
    | 'numberGreaterThan'
    | 'numberAtLeast'
    | 'numberLessThan'
    | 'numberAtMost'
    | 'attribute'
    | 'class';
  repickIndex?: number;
}
export interface ReplaySnapshot {
  status: 'idle' | 'running' | 'passed' | 'failed' | 'cancelled' | 'timedOut';
  steps: Array<{
    index: number;
    action: string;
    locator?: string;
    status: 'pending' | 'running' | 'passed' | 'failed';
    durationMs?: number;
    error?: string;
    pageUrl?: string;
  }>;
  startedAt?: string;
  durationMs?: number;
  screenshotPath?: string;
  tracePath?: string;
  error?: string;
}
export type AppCommand = { type: string; [key: string]: unknown };
export interface TestronApi {
  platform?: 'web' | 'desktop';
  command(command: AppCommand): void;
  onSnapshot(listener: (snapshot: AppSnapshot) => void): () => void;
}

declare global {
  interface Window {
    testron?: TestronApi;
    testronDesktop?: {
      platform: 'desktop';
      /** Absent on desktop builds that predate the workspace picker. */
      workspace?: { current: string; default: string; recent: string[]; glass: boolean };
      selectWorkspace?(url: string): void;
      forgetWorkspace?(url: string): void;
      setSurface?(surface: 'auth' | 'product'): void;
      setLocale(locale: 'en' | 'ru'): void;
      openLocal(request: {
        route: 'record' | 'recovery';
        projectId?: string;
        environmentId?: string;
        testId?: string;
      }): void;
      showProduct(): void;
      login(email: string, password: string): void;
      register(name: string, email: string, password: string): void;
      requestRuntimeState(): void;
      openReplayArtifact(artifact: 'screenshot' | 'trace'): void;
      runTest(request: DesktopRunRequest): void;
      refreshAuthentication(request: DesktopAuthenticationRefreshRequest): void;
      clearAuthentication(request: DesktopAuthenticationClearRequest): void;
      cancelRun(): void;
      installBrowser(): void;
      cancelBrowserInstall(): void;
      onRuntimeState(listener: (state: DesktopRuntimeState) => void): () => void;
    };
  }
}
