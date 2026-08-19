import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

import { AuthenticationService } from './auth.js';
import { createDatabase, type ServerDatabase } from './database/database.js';
import { CanonicalRepository } from './database/repository.js';
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
}): Promise<RunningTestronServer> => {
  const database = createDatabase(options.databaseUrl);
  if (options.migrate !== false)
    await database.migrate(fileURLToPath(new URL('../drizzle', import.meta.url)));
  const authentication = new AuthenticationService(
    database.db,
    options.publicBaseUrl ?? 'http://127.0.0.1',
  );
  const repository = new CanonicalRepository(database.db);
  const router = createAppRouter({ authentication, repository });
  const server = createHttpServer({ router, authentication });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, options.host ?? '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  const url = options.publicBaseUrl ?? `http://${address.address}:${address.port}`;
  if (!options.publicBaseUrl) authentication.setPublicBaseUrl(url);
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
