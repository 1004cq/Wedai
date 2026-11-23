import { join } from 'node:path';

import type { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import type { PgliteDatabase } from 'drizzle-orm/pglite';

/** Shared with snapshot/getTestDB — kept here to avoid a circular import. */
export const migrationsFolder = join(__dirname, '../../migrations');

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
    // Skip only ParadeDB/BM25 statements — never the whole migration.
    // 0205 mixes environment_id DDL with a conditional BM25 index; skipping
    // the file wholesale left agent_eval_test_cases without environment_id.
    for (const stmt of migration.sql) {
      const lower = stmt.toLowerCase();
      if (lower.includes('pg_search') || lower.includes('bm25')) continue;
      await pglite.exec(stmt);
    }

    await db.execute(
      sql`INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES (${migration.hash}, ${migration.folderMillis})`,
    );
  }
};
