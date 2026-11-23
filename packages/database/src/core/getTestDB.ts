import { drizzle as nodeDrizzle } from 'drizzle-orm/node-postgres';
import { migrate as nodeMigrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as pgliteDrizzle } from 'drizzle-orm/pglite';
import { Pool as NodePool } from 'pg';

import { serverDBEnv } from '@/config/db';

import * as schema from '../schemas';
import type { LobeChatDatabase } from '../type';
import { migratePGlite } from './pgliteMigrate';
import { createPGlite, migrationsFolder, readPGliteSnapshot } from './pgliteSnapshot';

const isServerDBMode = process.env.TEST_SERVER_DB === '1';

let testClientDB: ReturnType<typeof pgliteDrizzle<typeof schema>> | null = null;
let testServerDB: ReturnType<typeof nodeDrizzle<typeof schema>> | null = null;

const isTransientPostgresStartupError = (error: unknown): boolean => {
  const err = error as {
    cause?: { code?: string; message?: string };
    code?: string;
    message?: string;
  };
  const code = err?.cause?.code ?? err?.code;
  const message = `${err?.cause?.message ?? ''} ${err?.message ?? ''} ${String(error)}`;
  return (
    code === '57P03' ||
    message.includes('recovery mode') ||
    message.includes('Connection terminated') ||
    message.includes('ECONNREFUSED')
  );
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const getTestDB = async (): Promise<LobeChatDatabase> => {
  // Server DB mode (node-postgres)
  if (isServerDBMode) {
    if (testServerDB) return testServerDB as unknown as LobeChatDatabase;

    const connectionString = serverDBEnv.DATABASE_TEST_URL;

    if (!connectionString) {
      throw new Error('DATABASE_TEST_URL is not set');
    }

    const client = new NodePool({ connectionString });
    const db = nodeDrizzle(client, { schema });

    // ParadeDB / Postgres CI can briefly report 57P03 after pg_isready.
    let lastError: unknown;
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        await nodeMigrate(db, { migrationsFolder });
        testServerDB = db;
        return testServerDB as unknown as LobeChatDatabase;
      } catch (error) {
        lastError = error;
        if (!isTransientPostgresStartupError(error) || attempt === 7) break;
        await sleep(500 * (attempt + 1));
      }
    }

    await client.end().catch(() => undefined);
    throw lastError;
  }

  // Client DB mode (PGlite)
  if (testClientDB) return testClientDB as unknown as LobeChatDatabase;

  const snapshot = readPGliteSnapshot();
  const pglite = createPGlite(snapshot);
  testClientDB = pgliteDrizzle({ client: pglite, schema });

  // The global setup's snapshot is already migrated; without it, migrate here.
  if (!snapshot) await migratePGlite(pglite, testClientDB);

  return testClientDB as unknown as LobeChatDatabase;
};
