-- Wedai: model-level credit prices for the chat billing middleware
-- Admin-configurable via tRPC admin.pricing.* procedures.

CREATE TABLE IF NOT EXISTS "model_prices" (
  "id"                           TEXT         NOT NULL PRIMARY KEY,
  "model_id"                     VARCHAR(128) NOT NULL,
  "provider"                     VARCHAR(64)  NOT NULL,
  "prompt_credits_per_k_token"   BIGINT       NOT NULL DEFAULT 1,
  "completion_credits_per_k_token" BIGINT     NOT NULL DEFAULT 2,
  "is_active"                    BOOLEAN      NOT NULL DEFAULT FALSE,
  "archived_at"                  TIMESTAMPTZ,
  "note"                         TEXT,
  "created_at"                   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_at"                   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Only one active non-archived price per (model, provider) at a time.
CREATE UNIQUE INDEX IF NOT EXISTS "model_prices_model_id_provider_active_unique"
  ON "model_prices" ("model_id", "provider")
  WHERE "is_active" = true AND "archived_at" IS NULL;

CREATE INDEX IF NOT EXISTS "model_prices_model_id_idx" ON "model_prices" ("model_id");
CREATE INDEX IF NOT EXISTS "model_prices_provider_idx" ON "model_prices" ("provider");
