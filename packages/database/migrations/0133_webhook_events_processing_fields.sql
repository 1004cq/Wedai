-- Wedai: add payload_hash and processing_started_at to webhook_events
-- These fields implement the crash-lease and payload-integrity checks
-- required by WEBHOOK_IDEMPOTENCY.md §3.1 steps 3-5.

ALTER TABLE "webhook_events"
  ADD COLUMN IF NOT EXISTS "payload_hash"           VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "processing_started_at"  TIMESTAMPTZ;
