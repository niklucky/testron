import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

export interface ServerDatabase {
  db: Database;
  pool: Pool;
  migrate(migrationsFolder: string): Promise<void>;
  close(): Promise<void>;
}

export const createDatabase = (connectionString: string): ServerDatabase => {
  const pool = new Pool({ connectionString });
  const db = drizzle({ client: pool, schema });
  return {
    db,
    pool,
    migrate: (migrationsFolder) => migrate(db, { migrationsFolder }),
    close: () => pool.end(),
  };
};
