-- P4-1: composite index for StaleHoldReaper scan
-- WHERE kind = 'hold' AND created_at < $cutoff
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ledger_entries_kind_created_at_idx"
  ON "ledger_entries" ("kind", "created_at");
