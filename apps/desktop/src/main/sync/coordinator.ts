import { randomUUID } from 'node:crypto';

import {
  createEnvironmentRequestSchema,
  createProjectRequestSchema,
  createTestRequestSchema,
  getWorkspaceRequestSchema,
  saveTestRevisionRequestSchema,
  type MutationMetadata,
  type RequestMetadata,
  type WorkspaceSnapshot,
} from '@testron/protocol';
import type { TestronRepository } from '../persistence/repository';
import type { DesktopServerClient } from './server-client';

export interface SyncResult {
  status: 'synced' | 'offline' | 'conflicted' | 'error';
  message?: string;
  authenticationRequired?: boolean;
  workspace?: WorkspaceSnapshot;
}

const requestMeta = (clientVersion: string): RequestMetadata => ({
  protocolVersion: 1,
  requestId: randomUUID(),
  client: { kind: 'desktop', version: clientVersion },
  supportedStepVersions: [1],
});
const mutationMeta = (clientVersion: string, idempotencyKey: string): MutationMetadata => ({
  ...requestMeta(clientVersion),
  idempotencyKey,
});
const authenticationRequired = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null || !('data' in error)) return false;
  const data = error.data;
  return (
    typeof data === 'object' && data !== null && 'code' in data && data.code === 'UNAUTHORIZED'
  );
};

export class DesktopSyncCoordinator {
  private syncing: Promise<SyncResult> | undefined;

  constructor(
    private readonly repository: TestronRepository,
    private readonly client: Pick<
      DesktopServerClient,
      'createProject' | 'createEnvironment' | 'createTest' | 'getWorkspace' | 'saveTestRevision'
    >,
    private readonly clientVersion: string,
  ) {}

  async hydrate(): Promise<SyncResult> {
    try {
      const workspace = await this.client.getWorkspace(
        getWorkspaceRequestSchema.parse({ meta: requestMeta(this.clientVersion) }),
      );
      return { status: 'synced', workspace };
    } catch (error) {
      return this.transportError(error);
    }
  }

  flush(): Promise<SyncResult> {
    if (this.syncing) return this.syncing;
    this.syncing = this.flushAll().finally(() => {
      this.syncing = undefined;
    });
    return this.syncing;
  }

  private async flushAll(): Promise<SyncResult> {
    try {
      for (const project of this.repository.listProjects()) {
        if (this.repository.getServerId('project', project.id)) continue;
        const remote = await this.client.createProject(
          createProjectRequestSchema.parse({
            meta: mutationMeta(this.clientVersion, `project-create-${project.id}`),
            name: project.name,
          }),
        );
        this.repository.setServerId('project', project.id, remote.id);
      }
      for (const environment of this.repository.listEnvironments()) {
        if (this.repository.getServerId('environment', environment.id)) continue;
        const projectId = this.repository.getServerId('project', environment.projectId);
        if (!projectId) return { status: 'error', message: 'The project must synchronize first.' };
        const remote = await this.client.createEnvironment(
          createEnvironmentRequestSchema.parse({
            meta: mutationMeta(this.clientVersion, `environment-create-${environment.id}`),
            projectId,
            name: environment.name,
            baseUrl: environment.baseUrl,
            testIdAttribute: environment.testIdAttribute,
          }),
        );
        this.repository.setServerId('environment', environment.id, remote.id);
      }
      for (const { localTestId, draft } of this.repository.listDraftsNeedingSync()) {
        const environmentIds = draft.content.environmentIds.map((environmentId) =>
          this.repository.getServerId('environment', environmentId),
        );
        const projectId = this.repository.getServerId('project', draft.projectId);
        if (environmentIds.some((environmentId) => !environmentId) || !projectId)
          return {
            status: 'error',
            message: 'The project and environment must synchronize first.',
          };
        if (!draft.testId || !draft.baseRevision) {
          const snapshot = await this.client.createTest(
            createTestRequestSchema.parse({
              meta: mutationMeta(this.clientVersion, `test-create-${draft.draftId}`),
              projectId,
              testSuiteId: draft.testSuiteId,
              content: { ...draft.content, environmentIds: environmentIds as string[] },
            }),
          );
          this.repository.acknowledgeTest(localTestId, snapshot);
          continue;
        }
        const result = await this.client.saveTestRevision(
          saveTestRevisionRequestSchema.parse({
            meta: mutationMeta(
              this.clientVersion,
              `test-save-${draft.draftId}-${Date.parse(draft.localUpdatedAt)}`,
            ),
            testId: draft.testId,
            baseRevision: draft.baseRevision,
            content: { ...draft.content, environmentIds: environmentIds as string[] },
          }),
        );
        if (result.status === 'conflict') {
          this.repository.recordConflict(localTestId);
          return {
            status: 'conflicted',
            message: 'The server has a newer revision. Your local draft was kept.',
          };
        }
        this.repository.acknowledgeTest(localTestId, result.snapshot);
      }
      return { status: 'synced' };
    } catch (error) {
      return this.transportError(error);
    }
  }

  private transportError(error: unknown): SyncResult {
    const message = error instanceof Error ? error.message : String(error);
    return authenticationRequired(error)
      ? { status: 'error', message, authenticationRequired: true }
      : { status: 'offline', message };
  }
}
