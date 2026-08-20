CREATE TABLE IF NOT EXISTS "system_sms_config" (
  "id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "provider" text DEFAULT 'mock' NOT NULL,
  "access_key_id" text,
  "access_key_secret" text,
  "sign_name" text,
  "template_code" text,
  "scheme_name" text,
  "mock" boolean DEFAULT false NOT NULL,
  "enable_phone_register" boolean DEFAULT true NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

INSERT INTO "system_sms_config" ("id")
VALUES ('default')
ON CONFLICT ("id") DO NOTHING;
