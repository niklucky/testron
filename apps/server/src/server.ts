import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

import { AuthenticationService } from './auth.js';
import { AuthenticationEncryption } from './authentication-state/encryption.js';
import { ServerAuthenticationStateStore } from './authentication-state/store.js';
import { createDatabase, type ServerDatabase } from './database/database.js';
import { CanonicalRepository } from './database/repository.js';
import {
  disabledInvitationMailer,
  disabledPasswordResetMailer,
  ResendMailer,
  type InvitationMailer,
  type PasswordResetMailer,
} from './email.js';
import { createHttpServer } from './http.js';
import { createAppRouter, type AppRouter } from './trpc/router.js';
import { ServerRunQueue } from './test-runs/queue.js';
import { ServerArtifactRetention } from './test-runs/artifact-retention.js';
import { ServerPlaywrightRunner } from './test-runs/runner.js';
import type { RunnerEgressPolicy } from './test-runs/egress.js';

export interface RunningTestronServer {
  url: string;
  database: ServerDatabase;
  authentication: AuthenticationService;
  authenticationStates?: ServerAuthenticationStateStore;
  runQueue: ServerRunQueue;
  router: AppRouter;
  close(): Promise<void>;
}

export const startTestronServer = async (options: {
  databaseUrl: string;
  host?: string;
  port?: number;
  publicBaseUrl?: string;
  migrate?: boolean;
  invitationMailer?: InvitationMailer;
  passwordResetMailer?: PasswordResetMailer;
  resend?: { apiKey: string; from: string };
  webappDirectory?: string;
  authenticationEncryptionKeys?: string;
  artifactsDirectory?: string;
  runTimeoutMs?: number;
  runQueueEnabled?: boolean;
  runnerEgressPolicy?: RunnerEgressPolicy;
}): Promise<RunningTestronServer> => {
  if (
    options.runTimeoutMs !== undefined &&
    (!Number.isInteger(options.runTimeoutMs) ||
      options.runTimeoutMs < 1_000 ||
      options.runTimeoutMs > 3_600_000)
  )
    throw new Error('TESTRON_RUN_TIMEOUT_MS must be between 1000 and 3600000 milliseconds.');
  if (options.resend && !options.publicBaseUrl)
    throw new Error(
      'TESTRON_PUBLIC_URL is required when password-reset email delivery is enabled.',
    );
  const database = createDatabase(options.databaseUrl);
  if (options.migrate !== false)
    await database.migrate(fileURLToPath(new URL('../drizzle', import.meta.url)));
  const resendMailer = options.resend ? new ResendMailer(options.resend) : undefined;
  const invitationMailer = options.invitationMailer ?? resendMailer ?? disabledInvitationMailer;
  const passwordResetMailer =
    options.passwordResetMailer ?? resendMailer ?? disabledPasswordResetMailer;
  const authentication = new AuthenticationService(
    database.db,
    passwordResetMailer,
    options.publicBaseUrl,
  );
  const passwordResetDeliveryTimer = setInterval(() => {
    void authentication
      .deliverPendingPasswordResets()
      .catch((error: unknown) => console.error('Password reset outbox processing failed.', error));
  }, 30_000);
  passwordResetDeliveryTimer.unref();
  if (options.migrate !== false)
    void authentication
      .deliverPendingPasswordResets()
      .catch((error: unknown) => console.error('Password reset outbox processing failed.', error));
  const authenticationEncryption = AuthenticationEncryption.fromEnvironment(
    options.authenticationEncryptionKeys,
  );
  const repository = new CanonicalRepository(
    database.db,
    invitationMailer,
    authenticationEncryption,
  );
  const authenticationStates = authenticationEncryption
    ? new ServerAuthenticationStateStore(database.db, authenticationEncryption)
    : undefined;
  const artifactsDirectory = options.artifactsDirectory ?? 'data/artifacts';
  const artifactRetention = new ServerArtifactRetention(database.db, artifactsDirectory);
  const runQueue = new ServerRunQueue(
    database.db,
    artifactsDirectory,
    authenticationStates,
    options.runTimeoutMs,
    new ServerPlaywrightRunner(options.runnerEgressPolicy),
  );
  if (options.runQueueEnabled !== false) {
    await runQueue.start();
    artifactRetention.start();
  }
  const router = createAppRouter({
    authentication,
    repository,
    ...(options.runQueueEnabled === false ? {} : { runQueue }),
  });
  const server = createHttpServer({
    router,
    authentication,
    repository,
    artifactsDirectory,
    secureCookies: new URL(options.publicBaseUrl ?? 'http://localhost').protocol === 'https:',
    ...(options.webappDirectory ? { webappDirectory: options.webappDirectory } : {}),
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, options.host ?? '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  const url = options.publicBaseUrl ?? `http://${address.address}:${address.port}`;
  return {
    url,
    database,
    authentication,
    ...(authenticationStates ? { authenticationStates } : {}),
    runQueue,
    router,
    close: () => {
      clearInterval(passwordResetDeliveryTimer);
      return new Promise<void>((resolve, reject) => {
        server.close((error) => {
          void Promise.all([runQueue.close(), artifactRetention.close()])
            .then(() => authentication.waitForPasswordResetDelivery())
            .then(() => database.close())
            .then(() => {
              if (error) reject(error);
              else resolve();
            }, reject);
        });
      });
    },
  };
};
