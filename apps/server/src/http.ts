import { createServer, type Server, type ServerResponse } from 'node:http';

import { nodeHTTPRequestHandler } from '@trpc/server/adapters/node-http';

import type { AuthenticationService } from './auth.js';
import type { AppRouter } from './trpc/router.js';

const json = (response: ServerResponse, status: number, value: unknown): void => {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(value));
};

export const createHttpServer = (options: {
  router: AppRouter;
  authentication: AuthenticationService;
}): Server =>
  createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    try {
      const trpcPrefix = url.pathname.startsWith('/api/trpc/')
        ? '/api/trpc/'
        : url.pathname.startsWith('/trpc/')
          ? '/trpc/'
          : undefined;
      if (trpcPrefix) {
        await nodeHTTPRequestHandler({
          req: request,
          res: response,
          path: url.pathname.slice(trpcPrefix.length),
          router: options.router,
          createContext: async () => {
            const user = await options.authentication.authenticate(request.headers.authorization);
            return user ? { user } : {};
          },
        });
        return;
      }
      if (
        request.method === 'GET' &&
        (url.pathname === '/api/health' || url.pathname === '/health')
      ) {
        json(response, 200, { ok: true });
        return;
      }
      json(response, 404, { error: 'Not found' });
    } catch {
      json(response, 500, { error: 'Internal server error' });
    }
  });
