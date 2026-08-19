import { startTestronServer } from './server.js';

const port = Number(process.env.PORT ?? 4400);
const host = process.env.HOST ?? '127.0.0.1';
const publicBaseUrl = process.env.TESTRON_PUBLIC_URL ?? `http://${host}:${port}`;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const server = await startTestronServer({ databaseUrl, host, port, publicBaseUrl });

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
