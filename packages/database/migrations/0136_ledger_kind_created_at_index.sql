-- P4-1: composite index for StaleHoldReaper scan
-- WHERE kind = 'hold' AND created_at < $cutoff
-- (Non-CONCURRENTLY so drizzle migrator transactions can apply it; use
-- CREATE INDEX CONCURRENTLY manually on large production DBs if needed.)
CREATE INDEX IF NOT EXISTS "ledger_entries_kind_created_at_idx"
  ON "ledger_entries" ("kind", "created_at");
