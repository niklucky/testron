import { defineConfig } from 'drizzle-kit';

try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://testron:testron@127.0.0.1:55432/testron',
  },
});
