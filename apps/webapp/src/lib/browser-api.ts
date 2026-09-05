import type { WebWorkspaceSnapshot } from '@testron/protocol';
import {
  deletePlaywrightStepSource,
  parsePlaywright,
  reconcilePlaywrightSteps,
  renamePlaywrightTestSource,
  replacePlaywrightStepSource,
  rewritePlaywrightSteps,
} from '@testron/domain/codegen/parse-playwright';
import { generatePlaywright } from '@testron/domain/codegen/playwright';

import type { AuthenticationRequest } from '../components/features/auth/authentication';
import { mutationMeta, requestMeta } from './meta';
import { goToDashboard, goToTest } from './navigation';
import { queryClient, trpcClient } from './trpc';
import type { AppCommand, AppSnapshot, LibrarySnapshot, TestronApi } from './library';
import { workspaceQueryOptions } from './workspace';
import {
  applyStepMutation,
  createSerialMutationQueue,
  reconcileRevisionSteps,
  type StepMutationCommand,
} from './browser-step-mutations';

const listeners = new Set<(snapshot: AppSnapshot) => void>();
let workspace: WebWorkspaceSnapshot | undefined;
let selectedProjectId: string | undefined;
let selectedEnvironmentId: string | undefined;
let selectedTestSuiteId: string | undefined;
let selectedTestId: string | undefined;
let inviteeLookup: LibrarySnapshot['inviteeLookup'];
let runPollTimer: ReturnType<typeof setTimeout> | undefined;

export const libraryFromWorkspace = (value: WebWorkspaceSnapshot): LibrarySnapshot => {
  const projectId = selectedProjectId ?? value.projects[0]?.id;
  const environments = value.environments.filter((item) => item.projectId === projectId);
  const environmentId =
    selectedEnvironmentId && environments.some((item) => item.id === selectedEnvironmentId)
      ? selectedEnvironmentId
      : environments[0]?.id;
  selectedProjectId = projectId;
  selectedEnvironmentId = environmentId;
  const selectedTest = value.tests.find((item) => item.test.id === selectedTestId);
  return {
    viewer: value.viewer,
    members: value.members,
    invitations: value.invitations,
    pendingInvitations: value.pendingInvitations,
    inviteeLookup,
    projects: value.projects,
    environments: value.environments.map((item) => ({ ...item, authRevision: item.revision })),
    profiles: value.profiles.map(({ environments: profileEnvironments, ...profile }) => ({
      ...profile,
      environmentIds: profileEnvironments.map(({ environmentId }) => environmentId),
    })),
    authenticationFlows: value.authenticationFlows ?? [],
    profileEnvironmentAuthentications: value.profileEnvironmentAuthentications ?? [],
    projectSecrets: value.projectSecrets ?? [],
    authenticationStates: value.authenticationStates ?? [],
    authenticationFlowSecretNames: Object.fromEntries(
      (value.authenticationFlows ?? []).map((flow) => {
        const setup = value.tests.find((snapshot) => snapshot.test.id === flow.setupTestId);
        const names = [
          ...new Set(
            (setup?.currentRevision.content.steps ?? [])
              .map(({ payload }) =>
                payload.kind === 'fill' ? payload.secret?.environmentVariable : undefined,
              )
              .filter((name): name is string => name !== undefined),
          ),
        ];
        return [flow.id, names];
      }),
    ),
    profileVariables: value.profiles.flatMap((profile) =>
      profile.environments.flatMap((environment) =>
        environment.variables.map((variable) => ({
          profileId: profile.id,
          environmentId: environment.environmentId,
          ...variable,
        })),
      ),
    ),
    tests: value.tests.map(({ test, currentRevision }) => ({
      id: test.id,
      projectId: test.projectId,
      environmentIds: currentRevision.content.environmentIds,
      testSuiteId: test.testSuiteId,
      profileId: currentRevision.content.profileId ?? null,
      title: test.title,
      prerequisites: currentRevision.content.prerequisites,
      createdAt: test.createdAt,
      updatedAt: currentRevision.createdAt,
    })),
    testSuites: value.testSuites,
    deletedTests: value.deletedTests?.map(({ test, currentRevision }) => ({
      id: test.id,
      projectId: test.projectId,
      environmentIds: currentRevision.content.environmentIds,
      testSuiteId: test.testSuiteId,
      profileId: currentRevision.content.profileId ?? null,
      title: test.title,
      prerequisites: currentRevision.content.prerequisites,
      createdAt: test.createdAt,
      updatedAt: currentRevision.createdAt,
    })),
    deletedTestSuites: value.deletedTestSuites,
    latestTestRuns: value.latestTestRuns,
    recentRuns: value.recentRuns,
    activeRuns: value.activeRuns,
    runSchedules: value.runSchedules ?? [],
    serverRunJobs: value.serverRunJobs ?? [],
    projectOverviews: value.projectOverviews,
    recentActivity: value.recentActivity,
    selectedProjectId: projectId,
    selectedEnvironmentId: environmentId,
    selectedTestSuiteId,
    selectedProfileId: selectedTest?.currentRevision.content.profileId ?? undefined,
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
    (item) =>
      item.id === (selectedEnvironmentId ?? selected?.currentRevision.content.environmentIds[0]),
  );
  return {
    title: selected?.test.title ?? 'Untitled test',
    recording: false,
    status: 'idle',
    currentUrl: environment?.baseUrl ?? '',
    steps: selected?.currentRevision.content.steps.map((entry) => entry.payload) ?? [],
    descriptions: [],
    source:
      selected?.currentRevision.content.source ??
      generatePlaywright(
        selected?.test.title ?? 'Untitled test',
        selected?.currentRevision.content.steps.map(({ payload }) => payload) ?? [],
      ),
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
  if (runPollTimer) clearTimeout(runPollTimer);
  if (workspace.serverRunJobs?.some((job) => job.status === 'queued' || job.status === 'running'))
    runPollTimer = setTimeout(() => void refresh(), 2_000);
};

const value = <T>(command: AppCommand, key: string) => command[key] as T;
const mutate = async (operation: Promise<unknown>) => {
  await operation;
  await refresh();
};

type DocumentMutation = StepMutationCommand | { type: 'update-source'; source: string };

const enqueueDocumentMutation = createSerialMutationQueue(
  async ({
    testId,
    command,
    meta,
  }: {
    testId: string;
    command: DocumentMutation;
    meta: ReturnType<typeof mutationMeta>;
  }) => {
    const current = workspace?.tests.find((item) => item.test.id === testId);
    if (!current) return;
    const previousSteps = current.currentRevision.content.steps;
    const currentSource =
      current.currentRevision.content.source ??
      generatePlaywright(
        current.currentRevision.content.title,
        current.currentRevision.content.steps.map(({ payload }) => payload),
      );
    let source: string;
    let steps;
    let title = current.currentRevision.content.title;
    if (command.type === 'update-source') {
      source = command.source;
      const parsed = parsePlaywright(source);
      if (!parsed.error) {
        title = parsed.title;
        steps = reconcileRevisionSteps(
          previousSteps,
          reconcilePlaywrightSteps(
            previousSteps.map(({ payload }) => payload),
            parsed.steps.map(({ step }) => step),
          ),
        );
      } else steps = previousSteps;
    } else {
      if (parsePlaywright(currentSource).error) return;
      const nextSteps = applyStepMutation(
        previousSteps.map((entry) => entry.payload),
        command,
      );
      if (!nextSteps) return;
      source =
        command.type === 'update-step'
          ? replacePlaywrightStepSource(currentSource, command.index, command.step)
          : command.type === 'delete-step'
            ? deletePlaywrightStepSource(currentSource, command.index)
            : rewritePlaywrightSteps(currentSource, nextSteps);
      steps = reconcileRevisionSteps(previousSteps, nextSteps);
    }
    const result = await trpcClient.test.saveRevision.mutate({
      meta,
      testId: current.test.id,
      baseRevision: current.test.currentRevision,
      content: {
        ...current.currentRevision.content,
        title,
        source,
        steps,
      },
    });
    if (result.status !== 'saved') throw new Error('The test changed. Please retry.');
    await refresh();
  },
);

export const authenticateBrowser = async (request: AuthenticationRequest): Promise<void> => {
  if (request.mode === 'login') {
    await trpcClient.auth.login.mutate({ email: request.email, password: request.password });
  } else if (request.mode === 'register') {
    await trpcClient.auth.register.mutate({
      name: request.name,
      email: request.email,
      password: request.password,
    });
  } else if (request.mode === 'forgot') {
    await trpcClient.auth.requestPasswordReset.mutate({ email: request.email });
    return;
  } else {
    await trpcClient.auth.resetPassword.mutate({
      token: request.token,
      newPassword: request.newPassword,
    });
    return;
  }

  // The browser mutation establishes the web session. Logging in afterwards
  // also stores the desktop token without racing registration for the account.
  window.testronDesktop?.login(request.email, request.password);
  window.location.href = '/';
};

const command = (input: AppCommand): void => {
  const meta = mutationMeta(input.type);
  switch (input.type) {
    case 'login-server':
      void authenticateBrowser({
        mode: 'login',
        email: value(input, 'email'),
        password: value(input, 'password'),
      }).catch(() => undefined);
      break;
    case 'register-server':
      void authenticateBrowser({
        mode: 'register',
        name: value(input, 'name'),
        email: value(input, 'email'),
        password: value(input, 'password'),
      }).catch(() => undefined);
      break;
    case 'request-snapshot':
    case 'refresh-workspace':
    case 'sync-now':
      void refresh();
      break;
    case 'select-project': {
      const projectId = value<string>(input, 'projectId');
      selectedProjectId = projectId;
      selectedEnvironmentId = undefined;
      publish();
      goToDashboard(projectId);
      break;
    }
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
      selectedEnvironmentId = workspace?.tests.find((test) => test.test.id === selectedTestId)
        ?.currentRevision.content.environmentIds[0];
      publish();
      break;
    case 'select-profile': {
      const selected = workspace?.tests.find((test) => test.test.id === selectedTestId);
      if (!selected) break;
      void trpcClient.test.saveRevision
        .mutate({
          meta,
          testId: selected.test.id,
          baseRevision: selected.test.currentRevision,
          content: {
            ...selected.currentRevision.content,
            profileId: value<string | undefined>(input, 'profileId') ?? null,
          },
        })
        .then(async (result) => {
          if (result.status !== 'saved') throw new Error('The test changed. Please retry.');
          await refresh();
        });
      break;
    }
    case 'delete-step':
    case 'update-step':
    case 'replace-steps': {
      if (!selectedTestId) break;
      void enqueueDocumentMutation({
        testId: selectedTestId,
        command: input as StepMutationCommand,
        meta,
      }).catch((error: unknown) => {
        console.error('Could not save test steps.', error);
        void refresh();
      });
      break;
    }
    case 'update-source': {
      const sourceTestId = value<string | undefined>(input, 'testId') ?? selectedTestId;
      if (!sourceTestId) break;
      void enqueueDocumentMutation({
        testId: sourceTestId,
        command: { type: 'update-source', source: value<string>(input, 'source') },
        meta,
      }).catch((error: unknown) => {
        console.error('Could not save test source.', error);
        void refresh();
      });
      break;
    }
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
    case 'create-run-schedule':
      void mutate(
        trpcClient.runSchedule.create.mutate({
          meta,
          projectId: value(input, 'projectId'),
          name: value(input, 'name'),
          cron: value(input, 'cron'),
          environmentId: value(input, 'environmentId'),
          testIds: value(input, 'testIds'),
          enabled: value(input, 'enabled'),
        }),
      );
      break;
    case 'update-run-schedule':
      void mutate(
        trpcClient.runSchedule.update.mutate({
          meta,
          scheduleId: value(input, 'scheduleId'),
          baseRevision: value(input, 'baseRevision'),
          name: value(input, 'name'),
          cron: value(input, 'cron'),
          environmentId: value(input, 'environmentId'),
          testIds: value(input, 'testIds'),
          enabled: value(input, 'enabled'),
        }),
      );
      break;
    case 'delete-run-schedule':
      void mutate(
        trpcClient.runSchedule.delete.mutate({
          meta,
          scheduleId: value(input, 'scheduleId'),
          baseRevision: value(input, 'baseRevision'),
        }),
      );
      break;
    case 'enqueue-run-schedule':
      void mutate(
        trpcClient.runSchedule.enqueue.mutate({
          meta,
          scheduleId: value(input, 'scheduleId'),
        }),
      );
      break;
    case 'create-profile':
      void mutate(
        trpcClient.profile.create.mutate({
          meta,
          projectId: selectedProjectId!,
          name: value(input, 'name'),
          authenticationType: value(input, 'authenticationType'),
          environments: [
            {
              environmentId: value(input, 'environmentId'),
              variables: value(input, 'variables'),
            },
          ],
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
          authenticationType: value(input, 'authenticationType'),
          environmentId: value(input, 'environmentId'),
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
            environmentIds: value(input, 'environmentIds'),
            steps: [],
          },
        })
        .then(async (snapshot) => {
          selectedTestId = snapshot.test.id;
          selectedEnvironmentId =
            snapshot.currentRevision.content.environmentIds[0] ?? selectedEnvironmentId;
          await refresh();
          window.testronDesktop?.openLocal({
            route: 'record',
            projectId: snapshot.test.projectId,
            environmentId: snapshot.currentRevision.content.environmentIds[0],
            testId: snapshot.test.id,
          });
          if (!window.testronDesktop) goToTest(snapshot.test.id);
        });
      break;
    case 'delete-test': {
      const testId = value<string>(input, 'testId');
      const test = workspace?.tests.find((item) => item.test.id === testId);
      if (!test) break;
      void trpcClient.test.delete
        .mutate({
          meta,
          testId,
          baseRevision: test.test.currentRevision,
        })
        .then(async () => {
          if (selectedTestId === testId) selectedTestId = undefined;
          await refresh();
          goToDashboard();
        });
      break;
    }
    case 'rename-test': {
      const testId = value<string>(input, 'testId');
      const current = workspace?.tests.find((item) => item.test.id === testId);
      if (!current) break;
      const environmentIds =
        value<string[] | undefined>(input, 'environmentIds') ??
        current.currentRevision.content.environmentIds;
      const title = value<string>(input, 'title');
      const source = current.currentRevision.content.source
        ? renamePlaywrightTestSource(current.currentRevision.content.source, title)
        : undefined;
      void trpcClient.test.saveRevision
        .mutate({
          meta,
          testId,
          baseRevision: current.test.currentRevision,
          content: {
            ...current.currentRevision.content,
            title,
            ...(source ? { source } : {}),
            environmentIds,
          },
        })
        .then(async (result) => {
          if (result.status !== 'saved') throw new Error('The test changed. Please retry.');
          if (!selectedEnvironmentId || !environmentIds.includes(selectedEnvironmentId))
            selectedEnvironmentId = environmentIds[0];
          await refresh();
        });
      break;
    }
    case 'replace-prerequisites': {
      const testId = value<string>(input, 'testId');
      const current = workspace?.tests.find((item) => item.test.id === testId);
      if (!current) break;
      void trpcClient.test.saveRevision
        .mutate({
          meta,
          testId,
          baseRevision: current.test.currentRevision,
          content: {
            ...current.currentRevision.content,
            prerequisites: value(input, 'prerequisites'),
          },
        })
        .then(async (result) => {
          if (result.status !== 'saved') throw new Error('The test changed. Please retry.');
          await refresh();
        });
      break;
    }
    case 'move-test': {
      const testId = value<string>(input, 'testId');
      const test = workspace?.tests.find((item) => item.test.id === testId);
      if (!test) break;
      void trpcClient.test.move
        .mutate({
          meta,
          testId,
          baseRevision: test.test.currentRevision,
          projectId: value(input, 'projectId'),
          testSuiteId: value(input, 'testSuiteId'),
          environmentIds: value(input, 'environmentIds'),
        })
        .then(async (moved) => {
          selectedProjectId = moved.test.projectId;
          selectedTestSuiteId = moved.test.testSuiteId ?? undefined;
          selectedEnvironmentId = moved.currentRevision.content.environmentIds[0];
          selectedTestId = moved.test.id;
          await refresh();
          goToTest(moved.test.id, moved.test.projectId);
        });
      break;
    }
    case 'run-test':
      if (window.testronDesktop && selectedProjectId && selectedTestId)
        window.testronDesktop.runTest({
          projectId: selectedProjectId,
          environmentId: selectedEnvironmentId,
          testId: selectedTestId,
          environmentVariables: value(input, 'environmentVariables'),
          timeoutMs: value(input, 'timeoutMs'),
          headed: Boolean(value(input, 'headed')),
          authStateMode:
            'authStateMode' in input
              ? (value(input, 'authStateMode') as 'ignore' | 'reuse' | 'refresh')
              : value(input, 'reuseAuthState')
                ? 'reuse'
                : 'ignore',
        });
      break;
    case 'create-authentication-flow':
      void mutate(
        trpcClient.authenticationFlow.create.mutate({
          meta,
          projectId: value(input, 'projectId'),
          name: value(input, 'name'),
          setupTestId: value(input, 'setupTestId'),
          refreshPolicy: {
            mode: value(input, 'refreshMode'),
            maxAgeSeconds: value(input, 'maxAgeSeconds'),
            refreshBeforeExpirySeconds: value(input, 'refreshBeforeExpirySeconds'),
          },
        }),
      );
      break;
    case 'create-project-secret':
      void mutate(
        trpcClient.projectSecret.create.mutate({
          meta,
          projectId: value(input, 'projectId'),
          name: value(input, 'name'),
          value: value(input, 'value'),
        }),
      );
      break;
    case 'configure-profile-authentication':
      void mutate(
        trpcClient.authenticationFlow.configureProfile.mutate({
          meta,
          profileId: value(input, 'profileId'),
          environmentId: value(input, 'environmentId'),
          authFlowId: value(input, 'authFlowId'),
          secretBindings: value(input, 'secretBindings'),
        }),
      );
      break;
    case 'manage-server-authentication-state':
      void mutate(
        trpcClient.authenticationState.manage.mutate({
          meta,
          projectId: value(input, 'projectId'),
          environmentId: value(input, 'environmentId'),
          profileId: value(input, 'profileId'),
          action: value(input, 'action'),
        }),
      );
      break;
    case 'refresh-desktop-authentication':
      window.testronDesktop?.refreshAuthentication({
        profileId: value(input, 'profileId'),
        environmentId: value(input, 'environmentId'),
        secretValues: value(input, 'secretValues'),
      });
      break;
    case 'clear-desktop-authentication':
      window.testronDesktop?.clearAuthentication({
        profileId: value(input, 'profileId'),
        environmentId: value(input, 'environmentId'),
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
