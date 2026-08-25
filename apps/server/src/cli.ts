import { startTestronServer } from './server.js';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

const port = Number(process.env.PORT ?? 4400);
const host = process.env.HOST ?? '127.0.0.1';
const publicBaseUrl = process.env.TESTRON_PUBLIC_URL ?? `http://${host}:${port}`;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const resendApiKey = process.env.RESEND_API_KEY;
const resendFrom = process.env.RESEND_FROM_EMAIL;
const bundledWebappDirectory = fileURLToPath(new URL('../public', import.meta.url));
const webappDirectory =
  process.env.TESTRON_WEBAPP_DIR ??
  (existsSync(bundledWebappDirectory) ? bundledWebappDirectory : undefined);
if (resendApiKey && !resendFrom)
  throw new Error('RESEND_FROM_EMAIL is required when RESEND_API_KEY is configured.');
const server = await startTestronServer({
  databaseUrl,
  host,
  port,
  publicBaseUrl,
  ...(webappDirectory ? { webappDirectory } : {}),
  ...(resendApiKey && resendFrom ? { resend: { apiKey: resendApiKey, from: resendFrom } } : {}),
  ...(process.env.TESTRON_AUTH_ENCRYPTION_KEYS
    ? { authenticationEncryptionKeys: process.env.TESTRON_AUTH_ENCRYPTION_KEYS }
    : {}),
});

if (process.env.TESTRON_BOOTSTRAP_EMAIL && process.env.TESTRON_BOOTSTRAP_PASSWORD)
  await server.authentication.provisionUser(
    process.env.TESTRON_BOOTSTRAP_EMAIL,
    process.env.TESTRON_BOOTSTRAP_PASSWORD,
  );

console.log(`Testron server listening at ${server.url}`);

const shutdown = (): void => {
  void server.close().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
