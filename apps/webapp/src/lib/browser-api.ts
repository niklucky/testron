import type { WebWorkspaceSnapshot } from '@testron/protocol';

import { mutationMeta, requestMeta } from './meta';
import { goToTest } from './navigation';
import { queryClient, trpcClient } from './trpc';
import type { AppCommand, AppSnapshot, LibrarySnapshot, TestronApi } from './library';
import { workspaceQueryOptions } from './workspace';

const listeners = new Set<(snapshot: AppSnapshot) => void>();
let workspace: WebWorkspaceSnapshot | undefined;
let selectedProjectId: string | undefined;
let selectedEnvironmentId: string | undefined;
let selectedTestSuiteId: string | undefined;
let selectedTestId: string | undefined;
let inviteeLookup: LibrarySnapshot['inviteeLookup'];

export const libraryFromWorkspace = (value: WebWorkspaceSnapshot): LibrarySnapshot => {
  const projectId = selectedProjectId ?? value.projects[0]?.id;
  const environments = value.environments.filter((item) => item.projectId === projectId);
  const environmentId =
    selectedEnvironmentId && environments.some((item) => item.id === selectedEnvironmentId)
      ? selectedEnvironmentId
      : environments[0]?.id;
  selectedProjectId = projectId;
  selectedEnvironmentId = environmentId;
  return {
    viewer: value.viewer,
    members: value.members,
    invitations: value.invitations,
    pendingInvitations: value.pendingInvitations,
    inviteeLookup,
    projects: value.projects,
    environments: value.environments.map((item) => ({ ...item, authRevision: item.revision })),
    profiles: value.profiles.map(({ variables: _variables, ...profile }) => profile),
    profileVariables: value.profiles.flatMap((profile) =>
      profile.variables.map((variable) => ({ profileId: profile.id, ...variable })),
    ),
    tests: value.tests.map(({ test, currentRevision }) => ({
      id: test.id,
      projectId: test.projectId,
      environmentId: currentRevision.content.environmentId,
      testSuiteId: test.testSuiteId,
      title: test.title,
      createdAt: test.createdAt,
      updatedAt: currentRevision.createdAt,
    })),
    testSuites: value.testSuites,
    latestTestRuns: value.latestTestRuns,
    recentRuns: value.recentRuns,
    projectOverviews: value.projectOverviews,
    recentActivity: value.recentActivity,
    selectedProjectId: projectId,
    selectedEnvironmentId: environmentId,
    selectedTestSuiteId,
    selectedTestId,
    sync: { pending: 0, conflicts: 0 },
    runsInFlight: value.activeRuns.filter((run) => run.projectId === projectId).length,
    server: { configured: true, authentication: 'signedIn', workspace: 'loaded', status: 'synced' },
  };
};

const snapshotFromWorkspace = (value: WebWorkspaceSnapshot): AppSnapshot => {
  const library = libraryFromWorkspace(value);
  const selected = value.tests.find((item) => item.test.id === library.selectedTestId);
  const environment = value.environments.find(
    (item) => item.id === selected?.currentRevision.content.environmentId,
  );
  return {
    title: selected?.test.title ?? 'Untitled test',
    recording: false,
    status: 'idle',
    currentUrl: environment?.baseUrl ?? '',
    steps: selected?.currentRevision.content.steps.map((entry) => entry.payload) ?? [],
    descriptions: [],
    source: '',
    captureMode: 'record',
    stepWarnings: [],
    canUndo: false,
    canRedo: false,
    library,
    replay: { status: 'idle', steps: [] },
    replayHistory: [],
    verifyAssertion: 'visible',
  };
};

const publish = () => {
  if (!workspace) return;
  const snapshot = snapshotFromWorkspace(workspace);
  listeners.forEach((listener) => listener(snapshot));
};

const refresh = async () => {
  await queryClient.invalidateQueries({ queryKey: [['workspace', 'getWeb']] });
  workspace = await queryClient.fetchQuery(workspaceQueryOptions());
  publish();
};

const value = <T>(command: AppCommand, key: string) => command[key] as T;
const mutate = async (operation: Promise<unknown>) => {
  await operation;
  await refresh();
};

const command = (input: AppCommand): void => {
  const meta = mutationMeta(input.type);
  switch (input.type) {
    case 'login-server':
      window.testronDesktop?.login(value(input, 'email'), value(input, 'password'));
      void trpcClient.auth.login
        .mutate({ email: value(input, 'email'), password: value(input, 'password') })
        .then(() => {
          window.location.href = '/';
        });
      break;
    case 'register-server':
      window.testronDesktop?.register(
        value(input, 'name'),
        value(input, 'email'),
        value(input, 'password'),
      );
      void trpcClient.auth.register
        .mutate({
          name: value(input, 'name'),
          email: value(input, 'email'),
          password: value(input, 'password'),
        })
        .then(() => {
          window.location.href = '/';
        });
      break;
    case 'request-snapshot':
    case 'refresh-workspace':
    case 'sync-now':
      void refresh();
      break;
    case 'select-project':
      selectedProjectId = value(input, 'projectId');
      selectedEnvironmentId = undefined;
      publish();
      break;
    case 'select-environment':
      selectedEnvironmentId = value(input, 'environmentId');
      publish();
      break;
    case 'select-test-suite':
      selectedTestSuiteId = value(input, 'testSuiteId');
      publish();
      break;
    case 'select-test':
      selectedTestId = value(input, 'testId');
      publish();
      break;
    case 'create-project':
      void trpcClient.project.create
        .mutate({ meta, name: value(input, 'name') })
        .then(async (project) => {
          selectedProjectId = project.id;
          await refresh();
          window.location.href = `/projects/${project.id}`;
        });
      break;
    case 'update-project':
      void mutate(
        trpcClient.project.update.mutate({
          meta,
          projectId: value(input, 'projectId'),
          baseRevision: value(input, 'baseRevision'),
          name: value(input, 'name'),
          url: value(input, 'url'),
        }),
      );
      break;
    case 'create-environment':
      void mutate(
        trpcClient.environment.create.mutate({
          meta,
          projectId: value(input, 'projectId'),
          name: value(input, 'name'),
          baseUrl: value(input, 'baseUrl'),
          testIdAttribute: value(input, 'testIdAttribute'),
        }),
      );
      break;
    case 'update-environment':
      void mutate(
        trpcClient.environment.update.mutate({
          meta,
          environmentId: value(input, 'environmentId'),
          baseRevision: value(input, 'baseRevision'),
          name: value(input, 'name'),
          baseUrl: value(input, 'baseUrl'),
        }),
      );
      break;
    case 'create-profile':
      void mutate(
        trpcClient.profile.create.mutate({
          meta,
          environmentId: value(input, 'environmentId'),
          name: value(input, 'name'),
          authenticationType: 'credentials',
          variables: value(input, 'variables'),
        }),
      );
      break;
    case 'update-profile':
      void mutate(
        trpcClient.profile.update.mutate({
          meta,
          profileId: value(input, 'profileId'),
          baseRevision: value(input, 'baseRevision'),
          name: value(input, 'name'),
          authenticationType: 'credentials',
          variables: value(input, 'variables'),
        }),
      );
      break;
    case 'create-test-suite':
      void mutate(
        trpcClient.testSuite.create.mutate({
          meta,
          projectId: value(input, 'projectId'),
          name: value(input, 'name'),
        }),
      );
      break;
    case 'update-test-suite':
      void mutate(
        trpcClient.testSuite.update.mutate({
          meta,
          testSuiteId: value(input, 'testSuiteId'),
          baseRevision: value(input, 'baseRevision'),
          name: value(input, 'name'),
        }),
      );
      break;
    case 'delete-test-suite':
      void mutate(
        trpcClient.testSuite.delete.mutate({
          meta,
          testSuiteId: value(input, 'testSuiteId'),
          baseRevision: value(input, 'baseRevision'),
        }),
      );
      break;
    case 'create-test':
      void trpcClient.test.create
        .mutate({
          meta,
          projectId: value(input, 'projectId'),
          testSuiteId: selectedTestSuiteId ?? null,
          content: {
            stepSchemaVersion: 1,
            title: value(input, 'title'),
            environmentId: value(input, 'environmentId'),
            steps: [],
          },
        })
        .then(async (snapshot) => {
          selectedTestId = snapshot.test.id;
          await refresh();
          window.testronDesktop?.openLocal({
            route: 'record',
            projectId: snapshot.test.projectId,
            environmentId: snapshot.currentRevision.content.environmentId,
            testId: snapshot.test.id,
          });
          if (!window.testronDesktop) goToTest(snapshot.test.id);
        });
      break;
    case 'run-test':
      window.testronDesktop?.openLocal({
        route: 'test',
        projectId: selectedProjectId,
        environmentId: selectedEnvironmentId,
        testId: selectedTestId,
      });
      break;
    case 'lookup-invitee':
      void trpcClient.invitation.lookup
        .query({ meta: requestMeta(), email: value(input, 'email') })
        .then((result) => {
          inviteeLookup = result;
          publish();
        });
      break;
    case 'create-invitation':
      void mutate(
        trpcClient.invitation.create.mutate({
          meta,
          projectId: value(input, 'projectId'),
          email: value(input, 'email'),
        }),
      );
      break;
    case 'cancel-invitation':
      void mutate(
        trpcClient.invitation.cancel.mutate({ meta, invitationId: value(input, 'invitationId') }),
      );
      break;
    case 'respond-invitation':
      void mutate(
        trpcClient.invitation.respond.mutate({
          meta,
          invitationId: value(input, 'invitationId'),
          response: value(input, 'response'),
        }),
      );
      break;
    case 'set-member-blocked':
      void mutate(
        trpcClient.member.setBlocked.mutate({
          meta,
          projectId: value(input, 'projectId'),
          userId: value(input, 'userId'),
          blocked: value(input, 'blocked'),
        }),
      );
      break;
    case 'update-account-profile':
      void mutate(trpcClient.account.updateProfile.mutate({ meta, name: value(input, 'name') }));
      break;
    case 'change-account-password':
      void mutate(
        trpcClient.account.changePassword.mutate({
          meta,
          currentPassword: value(input, 'currentPassword'),
          newPassword: value(input, 'newPassword'),
        }),
      );
      break;
    case 'logout-server':
      void fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).then(() => {
        window.location.href = '/login';
      });
      break;
  }
};

export const browserApi: TestronApi = {
  platform: window.testronDesktop ? 'desktop' : 'web',
  command,
  onSnapshot(listener) {
    listeners.add(listener);
    if (workspace) listener(snapshotFromWorkspace(workspace));
    return () => listeners.delete(listener);
  },
};

window.testron = browserApi;

export const connectBrowserApi = (
  value: WebWorkspaceSnapshot,
  projectId: string,
  testId?: string,
) => {
  workspace = value;
  selectedProjectId = projectId;
  if (testId) selectedTestId = testId;
  window.testron = browserApi;
  publish();
};
