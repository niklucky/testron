import { createTRPCClient, httpBatchLink } from '@trpc/client';

import type {
  CreateEnvironmentRequest,
  CreateProjectRequest,
  CreateTestRequest,
  GetTestRequest,
  GetTestRevisionHistoryRequest,
  GetWorkspaceRequest,
  SaveTestRevisionRequest,
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

  register(email: string, password: string) {
    return this.api.auth.register.mutate({ email, password });
  }

  createProject(value: CreateProjectRequest) {
    return this.api.project.create.mutate(value);
  }

  createEnvironment(value: CreateEnvironmentRequest) {
    return this.api.environment.create.mutate(value);
  }

  createTest(value: CreateTestRequest) {
    return this.api.test.create.mutate(value);
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
}
