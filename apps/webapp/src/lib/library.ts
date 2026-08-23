import type { Step } from '@testron/domain/steps/schema';
import type {
  DesktopRunRequest,
  DesktopRuntimeState,
  ProjectActivity,
  ProjectInvitation,
  ProjectMember,
  ProjectOverviewSummary,
  TestRun,
  TestSuiteSummary,
  WebWorkspaceSnapshot,
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
  authenticationType: 'credentials' | 'cookies';
  revision?: number;
}

export interface TestRecord {
  id: string;
  projectId: string;
  environmentIds: string[];
  testSuiteId?: string | null;
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
    | 'countAtLeast';
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
      runTest(request: DesktopRunRequest): void;
      cancelRun(): void;
      installBrowser(): void;
      cancelBrowserInstall(): void;
      onRuntimeState(listener: (state: DesktopRuntimeState) => void): () => void;
    };
  }
}
