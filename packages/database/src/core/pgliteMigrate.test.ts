import { beforeEach, describe, expect, it, vi } from 'vitest';

const exec = vi.fn(async () => undefined);
const dbExecute = vi.fn(async () => undefined);

const readMigrationFiles = vi.fn();

describe('migratePGlite', () => {
  beforeEach(() => {
    // Database vitest runs with `isolate: false`, so other files may already
    // have loaded the real migrator. Reset and re-mock before each import.
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock('drizzle-orm/migrator', () => ({
      readMigrationFiles: (...args: unknown[]) => readMigrationFiles(...args),
    }));
  });

  it('runs DDL from a migration that also has a BM25 block, skipping only BM25 statements', async () => {
    readMigrationFiles.mockReturnValue([
      {
        folderMillis: 1,
        hash: '0205-test',
        sql: [
          'ALTER TABLE "agent_eval_test_cases" ADD COLUMN IF NOT EXISTS "environment_id" uuid',
          `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_search') THEN
            EXECUTE $bm25$ CREATE INDEX IF NOT EXISTS agent_eval_memories_bm25_idx ON agent_eval_memories USING bm25 $bm25$;
          END IF; END $$`,
        ],
      },
    ]);

    const { migratePGlite } = await import('./pgliteMigrate');
    await migratePGlite({ exec } as never, { execute: dbExecute } as never);

    expect(readMigrationFiles).toHaveBeenCalled();
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('CREATE SCHEMA'));
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('__drizzle_migrations'));
    expect(exec).toHaveBeenCalledWith(
      'ALTER TABLE "agent_eval_test_cases" ADD COLUMN IF NOT EXISTS "environment_id" uuid',
    );
    expect(exec.mock.calls.some((args) => String(args[0]).toLowerCase().includes('bm25'))).toBe(
      false,
    );
    expect(dbExecute).toHaveBeenCalledTimes(1);
  });
});
