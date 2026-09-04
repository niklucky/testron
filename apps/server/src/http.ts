import { createServer, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { nodeHTTPRequestHandler } from '@trpc/server/adapters/node-http';

import type { AuthenticationService } from './auth.js';
import type { AppRouter } from './trpc/router.js';
import type { AuthSessionOutput } from '@testron/protocol';
import { RepositoryError, type CanonicalRepository } from './database/repository.js';

const sessionCookieName = 'testron_session';

const cookieValue = (header: string | undefined, name: string): string | undefined =>
  header
    ?.split(';')
    .map((entry) => entry.trim().split('='))
    .find(([key]) => key === name)
    ?.slice(1)
    .join('=');

const sessionCookie = (session: AuthSessionOutput, secure: boolean): string => {
  const maxAge = Math.max(0, Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1_000));
  return [
    `${sessionCookieName}=${session.accessToken}`,
    'Path=/api',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
};

const expiredSessionCookie = (secure: boolean): string =>
  [
    `${sessionCookieName}=`,
    'Path=/api',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
    ...(secure ? ['Secure'] : []),
  ].join('; ');

const json = (response: ServerResponse, status: number, value: unknown): void => {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(value));
};

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

const serveWebapp = async (
  directory: string,
  pathname: string,
  response: ServerResponse,
): Promise<void> => {
  const root = path.resolve(directory);
  const relative = decodeURIComponent(pathname).replace(/^\/+/, '');
  const candidate = path.resolve(root, relative || 'index.html');
  const safeCandidate = candidate === root || candidate.startsWith(`${root}${path.sep}`);
  if (!safeCandidate) {
    json(response, 404, { error: 'Not found' });
    return;
  }
  let file = candidate;
  try {
    const body = await readFile(file);
    response.writeHead(200, {
      'content-type': contentTypes[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': file.includes(`${path.sep}assets${path.sep}`)
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    response.end(body);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (path.extname(relative)) {
    json(response, 404, { error: 'Not found' });
    return;
  }
  file = path.join(root, 'index.html');
  const body = await readFile(file);
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-cache',
    'x-content-type-options': 'nosniff',
  });
  response.end(body);
};

export const createHttpServer = (options: {
  router: AppRouter;
  authentication: AuthenticationService;
  repository: CanonicalRepository;
  artifactsDirectory: string;
  secureCookies?: boolean;
  webappDirectory?: string;
}): Server =>
  createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    try {
      const cookieToken = cookieValue(request.headers.cookie, sessionCookieName);
      if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
        await options.authentication.revoke(cookieToken);
        response.writeHead(204, {
          'set-cookie': expiredSessionCookie(Boolean(options.secureCookies)),
          'cache-control': 'no-store',
        });
        response.end();
        return;
      }
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
            const authorization =
              request.headers.authorization ?? (cookieToken ? `Bearer ${cookieToken}` : undefined);
            const user = await options.authentication.authenticate(authorization);
            return {
              ...(user ? { user } : {}),
              ...(request.socket.remoteAddress ? { requestIp: request.socket.remoteAddress } : {}),
              setSession: (session: AuthSessionOutput) =>
                response.setHeader(
                  'set-cookie',
                  sessionCookie(session, Boolean(options.secureCookies)),
                ),
            };
          },
        });
        return;
      }
      const artifactMatch = url.pathname.match(
        /^\/api\/runs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/artifacts\/(screenshot|video)$/i,
      );
      if ((request.method === 'GET' || request.method === 'HEAD') && artifactMatch) {
        const authorization =
          request.headers.authorization ?? (cookieToken ? `Bearer ${cookieToken}` : undefined);
        const user = await options.authentication.authenticate(authorization);
        if (!user) {
          json(response, 401, { error: 'Unauthorized' });
          return;
        }
        const kind = artifactMatch[2] as 'screenshot' | 'video';
        try {
          const artifact = await options.repository.getRunArtifact(user, artifactMatch[1]!, kind);
          const root = path.resolve(options.artifactsDirectory);
          const resolved = path.resolve(artifact);
          if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error('Unsafe artifact path.');
          const body = await readFile(resolved);
          response.writeHead(200, {
            'content-type': kind === 'screenshot' ? 'image/png' : 'video/webm',
            'content-length': body.length,
            'cache-control': 'private, max-age=300',
            'x-content-type-options': 'nosniff',
          });
          response.end(request.method === 'HEAD' ? undefined : body);
        } catch (error) {
          if (error instanceof RepositoryError) {
            json(response, error.code === 'FORBIDDEN' ? 403 : 404, { error: error.message });
            return;
          }
          // Retention may remove the file after authorization read its path.
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            json(response, 404, { error: 'The run artifact was not found.' });
            return;
          }
          throw error;
        }
        return;
      }
      if (
        request.method === 'GET' &&
        (url.pathname === '/api/health' || url.pathname === '/health')
      ) {
        json(response, 200, { ok: true });
        return;
      }
      if ((request.method === 'GET' || request.method === 'HEAD') && options.webappDirectory) {
        await serveWebapp(options.webappDirectory, url.pathname, response);
        return;
      }
      json(response, 404, { error: 'Not found' });
    } catch {
      json(response, 500, { error: 'Internal server error' });
    }
  });
