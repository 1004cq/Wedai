import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import type { PGlite } from '@electric-sql/pglite';

import { migrationsFolder } from './pgliteSnapshot';

/**
 * Apply drizzle migrations on PGlite.
 *
 * Upstream SQL uses `--> statement-breakpoint`. Wedai commercial migrations are
 * multi-statement files without breakpoints; PGlite prepared queries reject them
 * (42601). Use `pglite.exec` so both styles work without rewriting migration hashes.
 */
export const migratePGlite = async (
  pglite: PGlite,
  db: PgliteDatabase<Record<string, unknown>>,
) => {
  const migrations = readMigrationFiles({ migrationsFolder });

  await pglite.exec(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
  await pglite.exec(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  for (const migration of migrations) {
    const skipSql = migration.sql.some(
      (s) => s.toLowerCase().includes('pg_search') || s.toLowerCase().includes('bm25'),
    );

    if (!skipSql) {
      for (const stmt of migration.sql) {
        await pglite.exec(stmt);
      }
    }

    await db.execute(
      sql`INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES (${migration.hash}, ${migration.folderMillis})`,
    );
  }
};
