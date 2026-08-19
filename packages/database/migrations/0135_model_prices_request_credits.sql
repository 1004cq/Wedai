-- Add per-request flat credit price to model_prices.
-- Used by image and video generation (priced per generation, not per token).
ALTER TABLE "model_prices"
  ADD COLUMN IF NOT EXISTS "request_credits_flat" BIGINT NOT NULL DEFAULT 0;
