import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

import { AuthenticationService } from './auth.js';
import { createDatabase, type ServerDatabase } from './database/database.js';
import { CanonicalRepository } from './database/repository.js';
import {
  disabledInvitationMailer,
  ResendInvitationMailer,
  type InvitationMailer,
} from './email.js';
import { createHttpServer } from './http.js';
import { createAppRouter, type AppRouter } from './trpc/router.js';

export interface RunningTestronServer {
  url: string;
  database: ServerDatabase;
  authentication: AuthenticationService;
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
  resend?: { apiKey: string; from: string };
  webappDirectory?: string;
}): Promise<RunningTestronServer> => {
  const database = createDatabase(options.databaseUrl);
  if (options.migrate !== false)
    await database.migrate(fileURLToPath(new URL('../drizzle', import.meta.url)));
  const authentication = new AuthenticationService(database.db);
  const invitationMailer =
    options.invitationMailer ??
    (options.resend ? new ResendInvitationMailer(options.resend) : disabledInvitationMailer);
  const repository = new CanonicalRepository(database.db, invitationMailer);
  const router = createAppRouter({ authentication, repository });
  const server = createHttpServer({
    router,
    authentication,
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
    router,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          void database.close().then(() => {
            if (error) reject(error);
            else resolve();
          });
        });
      }),
  };
};
