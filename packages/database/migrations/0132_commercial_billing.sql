-- Wedai Phase-1 commercial billing tables
-- Migration: 0132_commercial_billing
--
-- Invariants:
--   • All monetary amounts are stored as BIGINT (integer minor-currency units).
--   • All credit/point amounts are stored as BIGINT (integer units).
--   • ledger_entries is append-only; no UPDATE/DELETE is permitted by application code.
--   • wallets is a denormalised cache; ledger_entries is always the audit source.
--   • Every external request and webhook has a unique idempotency key.

-- ─────────────────────────────────────────────────────────────────────────────
-- billing_accounts
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "billing_accounts" (
  "id"         TEXT        NOT NULL PRIMARY KEY,
  "user_id"    TEXT        NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "currency"   VARCHAR(8)  NOT NULL DEFAULT 'CNY',
  "status"     VARCHAR(16) NOT NULL DEFAULT 'active',
  "version"    INTEGER     NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "billing_accounts_user_id_unique"
  ON "billing_accounts" ("user_id");
CREATE INDEX IF NOT EXISTS "billing_accounts_status_idx"
  ON "billing_accounts" ("status");

-- ─────────────────────────────────────────────────────────────────────────────
-- plans
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "plans" (
  "id"                    TEXT         NOT NULL PRIMARY KEY,
  "slug"                  VARCHAR(64)  NOT NULL UNIQUE,
  "name"                  VARCHAR(128) NOT NULL,
  "description"           TEXT,
  "status"                VARCHAR(16)  NOT NULL DEFAULT 'active',
  "token_grant_monthly"   BIGINT       NOT NULL DEFAULT 0,
  "features"              JSONB                 DEFAULT '{}',
  "sort_order"            INTEGER      NOT NULL DEFAULT 0,
  "created_at"            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_at"            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "plans_status_idx" ON "plans" ("status");

-- ─────────────────────────────────────────────────────────────────────────────
-- plan_prices  (versioned snapshots — rows are immutable once referenced)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "plan_prices" (
  "id"                  TEXT         NOT NULL PRIMARY KEY,
  "plan_id"             TEXT         NOT NULL REFERENCES "plans"("id") ON DELETE RESTRICT,
  "currency"            VARCHAR(8)   NOT NULL,
  "amount_minor"        BIGINT       NOT NULL,
  "billing_interval"    VARCHAR(16)  NOT NULL,
  "archived_at"         TIMESTAMPTZ,
  "provider_price_id"   VARCHAR(128),
  "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "plan_prices_plan_id_idx"         ON "plan_prices" ("plan_id");
CREATE INDEX IF NOT EXISTS "plan_prices_provider_price_id_idx" ON "plan_prices" ("provider_price_id");

-- ─────────────────────────────────────────────────────────────────────────────
-- subscriptions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id"                        TEXT         NOT NULL PRIMARY KEY,
  "billing_account_id"        TEXT         NOT NULL REFERENCES "billing_accounts"("id") ON DELETE RESTRICT,
  "plan_id"                   TEXT         NOT NULL REFERENCES "plans"("id") ON DELETE RESTRICT,
  "plan_price_id"             TEXT         NOT NULL REFERENCES "plan_prices"("id") ON DELETE RESTRICT,
  "status"                    VARCHAR(16)  NOT NULL DEFAULT 'active',
  "current_period_start"      TIMESTAMPTZ  NOT NULL,
  "current_period_end"        TIMESTAMPTZ  NOT NULL,
  "cancel_at_period_end"      BOOLEAN      NOT NULL DEFAULT FALSE,
  "canceled_at"               TIMESTAMPTZ,
  "provider_subscription_id"  VARCHAR(128),
  "created_at"                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_at"                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "subscriptions_billing_account_id_idx"
  ON "subscriptions" ("billing_account_id");
CREATE INDEX IF NOT EXISTS "subscriptions_status_idx"
  ON "subscriptions" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_provider_subscription_id_unique"
  ON "subscriptions" ("provider_subscription_id")
  WHERE "provider_subscription_id" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- orders  (state machine: pending → paid | closed | failed)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "orders" (
  "id"               TEXT         NOT NULL PRIMARY KEY,
  "billing_account_id" TEXT       NOT NULL REFERENCES "billing_accounts"("id") ON DELETE RESTRICT,
  "user_id"          TEXT         NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "plan_price_id"    TEXT         NOT NULL REFERENCES "plan_prices"("id") ON DELETE RESTRICT,
  "status"           VARCHAR(16)  NOT NULL DEFAULT 'pending',
  "currency"         VARCHAR(8)   NOT NULL,
  "amount_minor"     BIGINT       NOT NULL,
  "price_snapshot"   JSONB        NOT NULL,
  "order_no"         VARCHAR(64)  NOT NULL UNIQUE,
  "idempotency_key"  VARCHAR(128) NOT NULL UNIQUE,
  "paid_at"          TIMESTAMPTZ,
  "closed_at"        TIMESTAMPTZ,
  "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_at"       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "orders_billing_account_id_idx" ON "orders" ("billing_account_id");
CREATE INDEX IF NOT EXISTS "orders_user_id_idx"            ON "orders" ("user_id");
CREATE INDEX IF NOT EXISTS "orders_status_idx"             ON "orders" ("status");
CREATE INDEX IF NOT EXISTS "orders_created_at_idx"         ON "orders" ("created_at");

-- ─────────────────────────────────────────────────────────────────────────────
-- payment_attempts
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "payment_attempts" (
  "id"               TEXT         NOT NULL PRIMARY KEY,
  "order_id"         TEXT         NOT NULL REFERENCES "orders"("id") ON DELETE RESTRICT,
  "provider"         VARCHAR(32)  NOT NULL,
  "provider_ref"     VARCHAR(256),
  "status"           VARCHAR(16)  NOT NULL DEFAULT 'pending',
  "idempotency_key"  VARCHAR(128) NOT NULL,
  "failure_code"     VARCHAR(64),
  "failure_message"  TEXT,
  "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_at"       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "payment_attempts_order_id_idx"
  ON "payment_attempts" ("order_id");
CREATE UNIQUE INDEX IF NOT EXISTS "payment_attempts_idempotency_key_unique"
  ON "payment_attempts" ("idempotency_key");
CREATE INDEX IF NOT EXISTS "payment_attempts_provider_ref_idx"
  ON "payment_attempts" ("provider_ref");

-- ─────────────────────────────────────────────────────────────────────────────
-- wallets  (fast-read cache; NOT the audit source of truth)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "wallets" (
  "id"                  TEXT        NOT NULL PRIMARY KEY,
  "billing_account_id"  TEXT        NOT NULL REFERENCES "billing_accounts"("id") ON DELETE CASCADE,
  "available"           BIGINT      NOT NULL DEFAULT 0,
  "reserved"            BIGINT      NOT NULL DEFAULT 0,
  "version"             INTEGER     NOT NULL DEFAULT 0,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "wallets_billing_account_id_unique"
  ON "wallets" ("billing_account_id");

-- ─────────────────────────────────────────────────────────────────────────────
-- ledger_entries  (append-only; rows MUST NOT be updated or deleted)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ledger_entries" (
  "id"                  TEXT         NOT NULL PRIMARY KEY,
  "billing_account_id"  TEXT         NOT NULL REFERENCES "billing_accounts"("id") ON DELETE RESTRICT,
  "kind"                VARCHAR(16)  NOT NULL,
  "delta"               BIGINT       NOT NULL,
  "balance_after"       BIGINT       NOT NULL,
  "idempotency_key"     VARCHAR(128) NOT NULL,
  "order_id"            TEXT         REFERENCES "orders"("id") ON DELETE RESTRICT,
  "usage_record_id"     TEXT,
  "reason"              VARCHAR(256),
  "operator_user_id"    TEXT         REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ledger_entries_idempotency_key_unique"
  ON "ledger_entries" ("idempotency_key");
CREATE INDEX IF NOT EXISTS "ledger_entries_billing_account_id_created_at_idx"
  ON "ledger_entries" ("billing_account_id", "created_at");
CREATE INDEX IF NOT EXISTS "ledger_entries_order_id_idx"
  ON "ledger_entries" ("order_id");
CREATE INDEX IF NOT EXISTS "ledger_entries_usage_record_id_idx"
  ON "ledger_entries" ("usage_record_id");
CREATE INDEX IF NOT EXISTS "ledger_entries_kind_idx"
  ON "ledger_entries" ("kind");

-- ─────────────────────────────────────────────────────────────────────────────
-- usage_records
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "usage_records" (
  "id"                  TEXT         NOT NULL PRIMARY KEY,
  "billing_account_id"  TEXT         NOT NULL REFERENCES "billing_accounts"("id") ON DELETE RESTRICT,
  "user_id"             TEXT         NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "request_id"          VARCHAR(128) NOT NULL,
  "model_id"            VARCHAR(128) NOT NULL,
  "provider"            VARCHAR(64)  NOT NULL,
  "plan_price_id"       TEXT         REFERENCES "plan_prices"("id") ON DELETE RESTRICT,
  "price_snapshot"      JSONB,
  "prompt_tokens"       INTEGER      NOT NULL DEFAULT 0,
  "completion_tokens"   INTEGER      NOT NULL DEFAULT 0,
  "total_tokens"        INTEGER      NOT NULL DEFAULT 0,
  "credits_charged"     BIGINT       NOT NULL DEFAULT 0,
  "settlement_status"   VARCHAR(16)  NOT NULL DEFAULT 'hold',
  "ledger_entry_id"     TEXT         REFERENCES "ledger_entries"("id") ON DELETE RESTRICT,
  "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_at"          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "usage_records_request_id_billing_account_id_unique"
  ON "usage_records" ("request_id", "billing_account_id");
CREATE INDEX IF NOT EXISTS "usage_records_billing_account_id_created_at_idx"
  ON "usage_records" ("billing_account_id", "created_at");
CREATE INDEX IF NOT EXISTS "usage_records_user_id_idx"    ON "usage_records" ("user_id");
CREATE INDEX IF NOT EXISTS "usage_records_model_id_idx"   ON "usage_records" ("model_id");

-- ─────────────────────────────────────────────────────────────────────────────
-- webhook_events
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "webhook_events" (
  "id"              TEXT         NOT NULL PRIMARY KEY,
  "provider"        VARCHAR(32)  NOT NULL,
  "event_id"        VARCHAR(256) NOT NULL,
  "event_type"      VARCHAR(128) NOT NULL,
  "status"          VARCHAR(16)  NOT NULL DEFAULT 'pending',
  "payload"         JSONB        NOT NULL,
  "order_id"        TEXT         REFERENCES "orders"("id") ON DELETE RESTRICT,
  "attempt_count"   INTEGER      NOT NULL DEFAULT 0,
  "processed_at"    TIMESTAMPTZ,
  "failure_reason"  TEXT,
  "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "webhook_events_provider_event_id_unique"
  ON "webhook_events" ("provider", "event_id");
CREATE INDEX IF NOT EXISTS "webhook_events_status_idx"     ON "webhook_events" ("status");
CREATE INDEX IF NOT EXISTS "webhook_events_order_id_idx"   ON "webhook_events" ("order_id");
CREATE INDEX IF NOT EXISTS "webhook_events_created_at_idx" ON "webhook_events" ("created_at");
