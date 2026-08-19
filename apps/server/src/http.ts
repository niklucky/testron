import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

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

const html = (response: ServerResponse, status: number, value: string): void => {
  response.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
    'x-content-type-options': 'nosniff',
  });
  response.end(value);
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return entities[character] ?? character;
  });

const form = async (request: IncomingMessage): Promise<Record<string, string>> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 20_000) throw new Error('The form body is too large.');
    chunks.push(buffer);
  }
  return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
};

export const createHttpServer = (options: {
  router: AppRouter;
  authentication: AuthenticationService;
}): Server =>
  createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    try {
      if (url.pathname.startsWith('/trpc/')) {
        await nodeHTTPRequestHandler({
          req: request,
          res: response,
          path: url.pathname.slice('/trpc/'.length),
          router: options.router,
          createContext: async () => {
            const user = await options.authentication.authenticate(request.headers.authorization);
            return user ? { user } : {};
          },
        });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/health') {
        json(response, 200, { ok: true });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/auth/desktop') {
        const code = escapeHtml(url.searchParams.get('code') ?? '');
        html(
          response,
          200,
          `<!doctype html><html><head><meta charset="utf-8"><title>Authorize Testron</title>
          <style>body{font:16px system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem}label{display:block;margin:1rem 0}input,button{font:inherit;padding:.6rem;width:100%;box-sizing:border-box}</style></head>
          <body><h1>Authorize Testron Desktop</h1><p>Confirm the code shown in the desktop application.</p>
          <form method="post" action="/auth/desktop"><label>Code<input name="userCode" value="${code}" required maxlength="8"></label>
          <label>Email<input name="email" type="email" required></label><label>Password<input name="password" type="password" required></label>
          <button type="submit">Authorize desktop</button></form></body></html>`,
        );
        return;
      }
      if (request.method === 'POST' && url.pathname === '/auth/desktop') {
        await options.authentication.approveDesktopLogin(await form(request));
        html(
          response,
          200,
          '<!doctype html><html><head><meta charset="utf-8"><title>Testron authorized</title></head><body><h1>Desktop authorized</h1><p>You can close this tab and return to Testron.</p></body></html>',
        );
        return;
      }
      json(response, 404, { error: 'Not found' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected server error.';
      if (url.pathname === '/auth/desktop')
        html(response, 400, `<h1>Authorization failed</h1><p>${escapeHtml(message)}</p>`);
      else json(response, 500, { error: 'Internal server error' });
    }
  });
