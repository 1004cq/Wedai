import { boolean, pgTable, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';

import { timestamps } from './_helpers';

/**
 * Deployment-wide LLM provider credentials (platform keys).
 *
 * Distinct from per-user `ai_providers.key_vaults` (BYOK). When
 * `BYOK_ALLOWED=false`, chat traffic uses these rows (or env fallbacks)
 * instead of user-supplied keys. Managed from `/admin/providers`.
 *
 * `credentials` is AES-GCM encrypted JSON via `KeyVaultsGateKeeper`.
 * Common plaintext shape:
 *
 *   { apiKey?: string, baseURL?: string,
 *     accessKeyId?: string, secretAccessKey?: string,
 *     region?: string, sessionToken?: string }
 *
 * Singleton per `provider` id (openai, anthropic, bedrock, …).
 */
export const systemLlmProviders = pgTable(
  'system_llm_providers',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** Provider id matching ModelProvider / LLM_PROVIDER_STATUS ids. */
    provider: varchar('provider', { length: 64 }).notNull(),

    /** Soft on/off — disabled rows are ignored by ModelRuntime fallback. */
    enabled: boolean('enabled').default(true).notNull(),

    /** AES-GCM encrypted credentials JSON. */
    credentials: text('credentials').notNull(),

    ...timestamps,
  },
  (t) => [uniqueIndex('system_llm_providers_provider_unique').on(t.provider)],
);

export const insertSystemLlmProviderSchema = createInsertSchema(systemLlmProviders);

export type NewSystemLlmProvider = typeof systemLlmProviders.$inferInsert;
export type SystemLlmProviderItem = typeof systemLlmProviders.$inferSelect;
