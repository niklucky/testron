import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), '../src/login');
const port = Number(process.env.TESTRON_FIXTURE_PORT ?? 4174);

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', `http://${request.headers.host}`).pathname;
  if (pathname === '/request-profile') {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(
      `<p data-testid="profile-request">${request.headers['x-testron-profile'] ?? ''}|${request.headers.cookie ?? ''}</p>`,
    );
    return;
  }
  const filename =
    pathname === '/welcome' ? 'welcome.html' : pathname === '/' ? 'index.html' : undefined;
  if (!filename) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy':
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
  });
  createReadStream(join(fixtureDirectory, filename)).pipe(response);
});

server.listen(port, '127.0.0.1', () => console.log(`Testron fixture: http://127.0.0.1:${port}`));
