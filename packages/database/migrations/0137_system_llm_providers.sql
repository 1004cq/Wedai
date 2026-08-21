-- Platform LLM provider secrets (admin-editable; AES-GCM ciphertext in app)
-- Migration: 0137_system_llm_providers

CREATE TABLE IF NOT EXISTS "system_llm_providers" (
  "id"          uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider"    varchar(64) NOT NULL,
  "enabled"     boolean     DEFAULT true NOT NULL,
  "credentials" text        NOT NULL,
  "accessed_at" timestamptz DEFAULT now() NOT NULL,
  "created_at"  timestamptz DEFAULT now() NOT NULL,
  "updated_at"  timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "system_llm_providers_provider_unique"
  ON "system_llm_providers" USING btree ("provider");
