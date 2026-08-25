import { createHash } from 'node:crypto';

import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';

import {
  authenticationStateIsStale,
  deriveAuthenticationStateExpiration,
  type AuthenticationStorageState,
} from '@testron/domain/auth/storage-state';
import type { TestRevisionContent } from '@testron/protocol';
import type { Database } from '../database/database.js';
import {
  authenticationStates,
  browserAuthenticationFlows,
  environments,
  profileEnvironmentAuthentications,
  profiles,
  projectSecrets,
  secretAuditEvents,
  testRevisions,
  tests,
} from '../database/schema.js';
import type { AuthenticationEncryption } from './encryption.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface ServerAuthenticationStateIdentity {
  owner: 'server';
  projectId: string;
  environmentId: string;
  environmentAuthRevision: number;
  profileId: string;
  profileRevision: number;
  authFlowId: string;
  authFlowRevision: number;
  setupTestId: string;
  setupTestRevision: number;
  secretBindingsRevision: number;
  browserEngine: 'chromium';
  formatVersion: 1;
}

export interface ServerAuthenticationRefreshInput {
  projectId: string;
  environmentId: string;
  profileId: string;
  authFlowId: string;
  setupTestId: string;
  setupTest: TestRevisionContent;
  secrets: Readonly<Record<string, string>>;
}

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (typeof value === 'object' && value !== null)
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(',')}}`;
  return JSON.stringify(value);
};

const sameIdentity = (left: unknown, right: ServerAuthenticationStateIdentity): boolean =>
  stable(left) === stable(right);
const identityRecord = (identity: ServerAuthenticationStateIdentity): Record<string, unknown> =>
  identity as unknown as Record<string, unknown>;

const bindingRevision = (
  assignmentRevision: number,
  secrets: ReadonlyArray<{ id: string; revision: number }>,
): number =>
  Number.parseInt(
    createHash('sha256')
      .update(
        stable({
          assignmentRevision,
          secrets: [...secrets].sort((left, right) => left.id.localeCompare(right.id)),
        }),
      )
      .digest('hex')
      .slice(0, 7),
    16,
  ) + 1;

const redactSecrets = (message: string, secrets: Readonly<Record<string, string>>): string => {
  let redacted = message;
  for (const value of Object.values(secrets))
    if (value) redacted = redacted.replaceAll(value, '[REDACTED]');
  return redacted.slice(0, 2_000);
};

const REFRESH_LEASE_MS = 10 * 60 * 1_000;
const REFRESH_POLL_MS = 100;
const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export class ServerAuthenticationStateStore {
  constructor(
    private readonly db: Database,
    private readonly encryption: AuthenticationEncryption,
  ) {}

  async getOrRefresh(
    scope: { projectId: string; environmentId: string; profileId: string },
    refresh: (input: ServerAuthenticationRefreshInput) => Promise<AuthenticationStorageState>,
    now = new Date(),
  ): Promise<AuthenticationStorageState> {
    const lockScope = `authentication-state:${scope.projectId}:${scope.environmentId}:${scope.profileId}`;
    const outcome = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockScope}))`);
      const resolved = await this.resolve(tx, scope);
      const [cached] = await tx
        .select()
        .from(authenticationStates)
        .where(
          and(
            eq(authenticationStates.owner, 'server'),
            eq(authenticationStates.projectId, scope.projectId),
            eq(authenticationStates.environmentId, scope.environmentId),
            eq(authenticationStates.profileId, scope.profileId),
          ),
        )
        .limit(1);
      if (
        cached?.status === 'ready' &&
        cached.encryptedState &&
        cached.keyVersion !== null &&
        cached.expiresAt &&
        sameIdentity(cached.identity, resolved.identity) &&
        resolved.refreshMode === 'when-stale' &&
        !authenticationStateIsStale(
          new Date(cached.expiresAt),
          resolved.refreshBeforeExpirySeconds,
          now,
        )
      ) {
        try {
          const value = this.encryption.decrypt(
            cached.encryptedState,
            cached.keyVersion,
            lockScope,
          );
          return {
            kind: 'cached' as const,
            state: JSON.parse(value) as AuthenticationStorageState,
          };
        } catch {
          // A missing rotation key or damaged payload is recoverable by logging in again.
        }
      }

      if (
        cached?.status === 'refreshing' &&
        sameIdentity(cached.identity, resolved.identity) &&
        Date.parse(cached.updatedAt) > Date.now() - REFRESH_LEASE_MS
      )
        return {
          kind: 'wait' as const,
          identity: resolved.identity,
          refreshStartedAt: cached.updatedAt,
        };

      await this.markRefreshing(tx, resolved.identity);
      return { kind: 'refresh' as const, resolved };
    });
    if (outcome.kind === 'cached') return outcome.state;
    if (outcome.kind === 'wait')
      return this.waitForRefresh(
        scope,
        outcome.identity,
        outcome.refreshStartedAt,
        lockScope,
        refresh,
        now,
      );

    const { resolved } = outcome;
    try {
      const state = await refresh({
        ...scope,
        authFlowId: resolved.identity.authFlowId,
        setupTestId: resolved.identity.setupTestId,
        setupTest: resolved.setupTest,
        secrets: resolved.secrets,
      });
      const createdAt = now.toISOString();
      const expiresAt = deriveAuthenticationStateExpiration(
        state,
        now,
        resolved.maxAgeSeconds,
      ).toISOString();
      const encrypted = this.encryption.encrypt(JSON.stringify(state), lockScope);
      await this.db
        .insert(authenticationStates)
        .values({
          owner: 'server',
          ...scope,
          authFlowId: resolved.identity.authFlowId,
          identity: identityRecord(resolved.identity),
          encryptedState: encrypted.value,
          keyVersion: encrypted.keyVersion,
          status: 'ready',
          createdAt,
          expiresAt,
          lastError: null,
          updatedAt: createdAt,
        })
        .onConflictDoUpdate({
          target: [
            authenticationStates.owner,
            authenticationStates.projectId,
            authenticationStates.environmentId,
            authenticationStates.profileId,
          ],
          set: {
            authFlowId: resolved.identity.authFlowId,
            identity: identityRecord(resolved.identity),
            encryptedState: encrypted.value,
            keyVersion: encrypted.keyVersion,
            status: 'ready',
            createdAt,
            expiresAt,
            lastError: null,
            updatedAt: createdAt,
          },
        });
      return state;
    } catch (error) {
      const message = redactSecrets(
        error instanceof Error ? error.message : 'Authentication refresh failed.',
        resolved.secrets,
      );
      await this.db
        .update(authenticationStates)
        .set({
          status: 'refresh-failed',
          lastError: message,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(authenticationStates.owner, 'server'),
            eq(authenticationStates.projectId, scope.projectId),
            eq(authenticationStates.environmentId, scope.environmentId),
            eq(authenticationStates.profileId, scope.profileId),
            eq(authenticationStates.status, 'refreshing'),
          ),
        );
      // The original error may contain decrypted secret values; keep only the redacted symptom.
      // eslint-disable-next-line preserve-caught-error
      throw new Error(message);
    }
  }

  private async waitForRefresh(
    scope: { projectId: string; environmentId: string; profileId: string },
    identity: ServerAuthenticationStateIdentity,
    refreshStartedAt: string,
    lockScope: string,
    refresh: (input: ServerAuthenticationRefreshInput) => Promise<AuthenticationStorageState>,
    now: Date,
  ): Promise<AuthenticationStorageState> {
    const deadline = Date.parse(refreshStartedAt) + REFRESH_LEASE_MS;
    while (Date.now() < deadline) {
      await delay(REFRESH_POLL_MS);
      const [state] = await this.db
        .select()
        .from(authenticationStates)
        .where(
          and(
            eq(authenticationStates.owner, 'server'),
            eq(authenticationStates.projectId, scope.projectId),
            eq(authenticationStates.environmentId, scope.environmentId),
            eq(authenticationStates.profileId, scope.profileId),
          ),
        )
        .limit(1);
      if (state?.status === 'refreshing' && state.updatedAt === refreshStartedAt) continue;
      if (
        state?.status === 'ready' &&
        state.encryptedState &&
        state.keyVersion !== null &&
        sameIdentity(state.identity, identity)
      ) {
        try {
          return JSON.parse(
            this.encryption.decrypt(state.encryptedState, state.keyVersion, lockScope),
          ) as AuthenticationStorageState;
        } catch {
          await this.invalidate(scope);
          return this.getOrRefresh(scope, refresh, now);
        }
      }
      if (state?.status === 'refresh-failed')
        throw new Error(state.lastError ?? 'Authentication refresh failed.');
      return this.getOrRefresh(scope, refresh, now);
    }
    return this.getOrRefresh(scope, refresh, now);
  }

  async clear(scope: {
    projectId: string;
    environmentId: string;
    profileId: string;
  }): Promise<void> {
    await this.db
      .delete(authenticationStates)
      .where(
        and(
          eq(authenticationStates.owner, 'server'),
          eq(authenticationStates.projectId, scope.projectId),
          eq(authenticationStates.environmentId, scope.environmentId),
          eq(authenticationStates.profileId, scope.profileId),
        ),
      );
  }

  async invalidate(scope: {
    projectId: string;
    environmentId: string;
    profileId: string;
  }): Promise<void> {
    await this.db
      .update(authenticationStates)
      .set({ status: 'stale', updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(authenticationStates.owner, 'server'),
          eq(authenticationStates.projectId, scope.projectId),
          eq(authenticationStates.environmentId, scope.environmentId),
          eq(authenticationStates.profileId, scope.profileId),
        ),
      );
  }

  /** Runs a requested test with at most one stale-session refresh and retry. */
  async runWithAuthenticationRetry<T>(options: {
    scope: { projectId: string; environmentId: string; profileId: string };
    refresh: (input: ServerAuthenticationRefreshInput) => Promise<AuthenticationStorageState>;
    execute: (state: AuthenticationStorageState, attempt: 1 | 2) => Promise<T>;
    authenticationFailed: (result: T) => boolean;
  }): Promise<T> {
    const initialState = await this.getOrRefresh(options.scope, options.refresh);
    const initialResult = await options.execute(initialState, 1);
    if (!options.authenticationFailed(initialResult)) return initialResult;
    await this.invalidate(options.scope);
    const refreshedState = await this.getOrRefresh(options.scope, options.refresh);
    return options.execute(refreshedState, 2);
  }

  private async markRefreshing(
    tx: Transaction,
    identity: ServerAuthenticationStateIdentity,
  ): Promise<void> {
    await tx
      .insert(authenticationStates)
      .values({
        owner: 'server',
        projectId: identity.projectId,
        environmentId: identity.environmentId,
        profileId: identity.profileId,
        authFlowId: identity.authFlowId,
        identity: identityRecord(identity),
        status: 'refreshing',
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: [
          authenticationStates.owner,
          authenticationStates.projectId,
          authenticationStates.environmentId,
          authenticationStates.profileId,
        ],
        set: {
          authFlowId: identity.authFlowId,
          identity: identityRecord(identity),
          status: 'refreshing',
          lastError: null,
          updatedAt: new Date().toISOString(),
        },
      });
  }

  private async resolve(
    tx: Transaction,
    scope: { projectId: string; environmentId: string; profileId: string },
  ): Promise<{
    identity: ServerAuthenticationStateIdentity;
    setupTest: TestRevisionContent;
    secrets: Record<string, string>;
    refreshMode: 'when-stale' | 'before-every-run';
    maxAgeSeconds: number;
    refreshBeforeExpirySeconds: number;
  }> {
    const [configuration] = await tx
      .select({
        assignment: profileEnvironmentAuthentications,
        profileRevision: profiles.revision,
        profileProjectId: profiles.projectId,
        environmentRevision: environments.revision,
        environmentProjectId: environments.projectId,
        flow: browserAuthenticationFlows,
        setupTestRevision: tests.currentRevisionNumber,
      })
      .from(profileEnvironmentAuthentications)
      .innerJoin(profiles, eq(profiles.id, profileEnvironmentAuthentications.profileId))
      .innerJoin(environments, eq(environments.id, profileEnvironmentAuthentications.environmentId))
      .innerJoin(
        browserAuthenticationFlows,
        eq(browserAuthenticationFlows.id, profileEnvironmentAuthentications.authFlowId),
      )
      .innerJoin(tests, eq(tests.id, browserAuthenticationFlows.setupTestId))
      .where(
        and(
          eq(profileEnvironmentAuthentications.profileId, scope.profileId),
          eq(profileEnvironmentAuthentications.environmentId, scope.environmentId),
          isNull(profiles.deletedAt),
          isNull(environments.deletedAt),
          isNull(browserAuthenticationFlows.deletedAt),
          isNull(tests.deletedAt),
        ),
      )
      .limit(1);
    if (
      !configuration ||
      configuration.profileProjectId !== scope.projectId ||
      configuration.environmentProjectId !== scope.projectId ||
      configuration.flow.projectId !== scope.projectId ||
      configuration.setupTestRevision === null
    )
      throw new Error('Browser authentication is not configured for this project scope.');
    const [setupRevision] = await tx
      .select({ content: testRevisions.content })
      .from(testRevisions)
      .where(
        and(
          eq(testRevisions.testId, configuration.flow.setupTestId),
          eq(testRevisions.number, configuration.setupTestRevision),
        ),
      )
      .limit(1);
    const setupTest = setupRevision?.content;
    if (!setupTest) throw new Error('The authentication setup test revision is unavailable.');

    const bindings = Object.entries(configuration.assignment.secretBindings);
    const resolvedSecrets: Record<string, string> = {};
    const revisions: Array<{ id: string; revision: number }> = [];
    for (const [name, { secretId }] of bindings) {
      const [secret] = await tx
        .select()
        .from(projectSecrets)
        .where(
          and(
            eq(projectSecrets.id, secretId),
            eq(projectSecrets.projectId, scope.projectId),
            isNull(projectSecrets.deletedAt),
            isNotNull(projectSecrets.encryptedValue),
          ),
        )
        .limit(1);
      if (!secret?.encryptedValue || secret.keyVersion === null)
        throw new Error(`The secret binding ${name} is not configured.`);
      resolvedSecrets[name] = this.encryption.decrypt(
        secret.encryptedValue,
        secret.keyVersion,
        `${scope.projectId}:${secret.id}`,
      );
      revisions.push({ id: secret.id, revision: secret.revision });
      await tx.insert(secretAuditEvents).values({
        projectId: scope.projectId,
        secretId: secret.id,
        actorId: null,
        action: 'worker-accessed',
      });
    }
    return {
      identity: {
        owner: 'server',
        ...scope,
        environmentAuthRevision: configuration.environmentRevision,
        profileRevision: configuration.profileRevision,
        authFlowId: configuration.flow.id,
        authFlowRevision: configuration.flow.revision,
        setupTestId: configuration.flow.setupTestId,
        setupTestRevision: configuration.setupTestRevision,
        secretBindingsRevision: bindingRevision(configuration.assignment.revision, revisions),
        browserEngine: 'chromium',
        formatVersion: 1,
      },
      setupTest,
      secrets: resolvedSecrets,
      refreshMode: configuration.flow.refreshMode as 'when-stale' | 'before-every-run',
      maxAgeSeconds: configuration.flow.maxAgeSeconds,
      refreshBeforeExpirySeconds: configuration.flow.refreshBeforeExpirySeconds,
    };
  }
}
