import { createTRPCClient, httpBatchLink } from '@trpc/client';

import type {
  CreateEnvironmentRequest,
  CreateInvitationRequest,
  CreateProjectRequest,
  CreateProfileRequest,
  CreateTestRequest,
  CreateTestSuiteRequest,
  DeleteTestSuiteRequest,
  FinishTestRunRequest,
  GetTestRequest,
  GetTestRevisionHistoryRequest,
  GetWorkspaceRequest,
  ListTestSuitesRequest,
  LookupInviteeRequest,
  SaveTestRevisionRequest,
  StartTestRunRequest,
  RespondInvitationRequest,
  CancelInvitationRequest,
  ChangeAccountPasswordRequest,
  SetMemberBlockedRequest,
  UpdateAccountProfileRequest,
  UpdateEnvironmentRequest,
  UpdateProjectRequest,
  UpdateProfileRequest,
  UpdateTestSuiteRequest,
} from '@testron/protocol';
import type { AppRouter } from '@testron/server/router';

export class DesktopServerClient {
  private readonly api: ReturnType<typeof createTRPCClient<AppRouter>>;

  constructor(baseUrl: string, token: () => Promise<string | undefined>) {
    this.api = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: new URL('/trpc', baseUrl).toString(),
          headers: async () => {
            const accessToken = await token();
            return accessToken ? { authorization: `Bearer ${accessToken}` } : {};
          },
        }),
      ],
    });
  }

  login(email: string, password: string) {
    return this.api.auth.login.mutate({ email, password });
  }

  register(name: string, email: string, password: string) {
    return this.api.auth.register.mutate({ name, email, password });
  }

  updateAccountProfile(value: UpdateAccountProfileRequest) {
    return this.api.account.updateProfile.mutate(value);
  }

  changeAccountPassword(value: ChangeAccountPasswordRequest) {
    return this.api.account.changePassword.mutate(value);
  }

  lookupInvitee(value: LookupInviteeRequest) {
    return this.api.invitation.lookup.query(value);
  }

  createInvitation(value: CreateInvitationRequest) {
    return this.api.invitation.create.mutate(value);
  }

  respondInvitation(value: RespondInvitationRequest) {
    return this.api.invitation.respond.mutate(value);
  }

  cancelInvitation(value: CancelInvitationRequest) {
    return this.api.invitation.cancel.mutate(value);
  }

  setMemberBlocked(value: SetMemberBlockedRequest) {
    return this.api.member.setBlocked.mutate(value);
  }

  createProject(value: CreateProjectRequest) {
    return this.api.project.create.mutate(value);
  }

  createEnvironment(value: CreateEnvironmentRequest) {
    return this.api.environment.create.mutate(value);
  }

  updateProject(value: UpdateProjectRequest) {
    return this.api.project.update.mutate(value);
  }

  updateEnvironment(value: UpdateEnvironmentRequest) {
    return this.api.environment.update.mutate(value);
  }

  createProfile(value: CreateProfileRequest) {
    return this.api.profile.create.mutate(value);
  }

  updateProfile(value: UpdateProfileRequest) {
    return this.api.profile.update.mutate(value);
  }

  createTest(value: CreateTestRequest) {
    return this.api.test.create.mutate(value);
  }

  createTestSuite(value: CreateTestSuiteRequest) {
    return this.api.testSuite.create.mutate(value);
  }

  listTestSuites(value: ListTestSuitesRequest) {
    return this.api.testSuite.list.query(value);
  }

  updateTestSuite(value: UpdateTestSuiteRequest) {
    return this.api.testSuite.update.mutate(value);
  }

  deleteTestSuite(value: DeleteTestSuiteRequest) {
    return this.api.testSuite.delete.mutate(value);
  }

  getWorkspace(value: GetWorkspaceRequest) {
    return this.api.workspace.get.query(value);
  }

  getTest(value: GetTestRequest) {
    return this.api.test.get.query(value);
  }

  getTestRevisionHistory(value: GetTestRevisionHistoryRequest) {
    return this.api.test.history.query(value);
  }

  saveTestRevision(value: SaveTestRevisionRequest) {
    return this.api.test.saveRevision.mutate(value);
  }

  startTestRun(value: StartTestRunRequest) {
    return this.api.run.start.mutate(value);
  }

  finishTestRun(value: FinishTestRunRequest) {
    return this.api.run.finish.mutate(value);
  }
}
