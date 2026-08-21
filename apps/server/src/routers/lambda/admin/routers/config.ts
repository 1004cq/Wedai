/**
 * admin.config — system configuration status + LLM platform secret writes.
 *
 * SECURITY CONTRACT:
 *  - Secret values are NEVER returned — only boolean `configured` flags
 *    (and non-secret baseURL / region for editing).
 *  - Updates use empty-skip overwrite: blank apiKey / secret fields leave
 *    existing ciphertext untouched.
 *  - Only `adminProcedure` callers (role='admin' in DB) may read/write.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  hasUsableCredentials,
  type SystemLlmCredentials,
  SystemLlmProviderModel,
} from '@/database/models/systemLlmProvider';
import { router } from '@/libs/trpc/lambda';
import { LLM_PROVIDER_STATUS } from '@/server/const/adminLlmProviders';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';
import { mergeLlmCredentialUpdate } from '@/server/services/platformLlmProviders';

import { adminProcedure } from '../middleware';

export { LLM_PROVIDER_STATUS };

/** Returns true if the env var is set to a non-empty string. */
const isSet = (name: string, env: NodeJS.ProcessEnv = process.env): boolean => {
  const v = env[name];
  return typeof v === 'string' && v.trim().length > 0;
};

/**
 * Masks a string value, showing only the last 4 characters.
 * Returns null if the value is not set.
 * NEVER call this on a full secret key — only on non-sensitive identifiers.
 */
const maskId = (name: string, env: NodeJS.ProcessEnv = process.env): string | null => {
  const v = env[name];
  if (!v || v.trim().length === 0) return null;
  const trimmed = v.trim();
  return trimmed.length <= 4 ? '••••' : `••••${trimmed.slice(-4)}`;
};

export type AdminLlmProviderStatus = {
  baseURL: string | null;
  configured: boolean;
  dbConfigured: boolean;
  enabled: boolean;
  envConfigured: boolean;
  envKey: string;
  id: string;
  label: string;
  region: string | null;
  source: 'both' | 'db' | 'env' | 'none';
};

export type BuildAdminConfigStatusOptions = {
  llmDbRows?: Array<{
    credentials: SystemLlmCredentials;
    enabled: boolean;
    provider: string;
  }>;
};

/** Pure builder — unit-tested without adminProcedure / DB. */
export const buildAdminConfigStatus = (
  env: NodeJS.ProcessEnv = process.env,
  options: BuildAdminConfigStatusOptions = {},
) => {
  const dbByProvider = new Map(
    (options.llmDbRows ?? []).map((row) => [row.provider, row] as const),
  );

  const llmProviders: AdminLlmProviderStatus[] = LLM_PROVIDER_STATUS.map(
    ({ envKey, id, label }) => {
      const envConfigured = isSet(envKey, env);
      const dbRow = dbByProvider.get(id);
      const dbConfigured = !!dbRow && dbRow.enabled && hasUsableCredentials(dbRow.credentials);
      const configured = envConfigured || dbConfigured;
      const source: AdminLlmProviderStatus['source'] =
        envConfigured && dbConfigured
          ? 'both'
          : dbConfigured
            ? 'db'
            : envConfigured
              ? 'env'
              : 'none';

      return {
        baseURL: dbRow?.credentials.baseURL?.trim() ? dbRow.credentials.baseURL.trim() : null,
        configured,
        dbConfigured,
        enabled: dbRow ? dbRow.enabled : true,
        envConfigured,
        envKey,
        id,
        label,
        region: dbRow?.credentials.region?.trim() ? dbRow.credentials.region.trim() : null,
        source,
      };
    },
  );

  const byokAllowed = env.BYOK_ALLOWED !== 'false';

  return {
    stripe: {
      /** Whether Stripe integration is enabled. */
      enabled: isSet('STRIPE_SECRET_KEY', env) && isSet('STRIPE_WEBHOOK_SECRET', env),
      publishableKeyConfigured: isSet('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', env),
      secretKeyConfigured: isSet('STRIPE_SECRET_KEY', env),
      webhookSecretConfigured: isSet('STRIPE_WEBHOOK_SECRET', env),
    },

    email: {
      /** Whether SMTP or Resend is configured for transactional email. */
      configured: isSet('SMTP_HOST', env) || isSet('RESEND_API_KEY', env),
      provider: isSet('RESEND_API_KEY', env) ? 'resend' : isSet('SMTP_HOST', env) ? 'smtp' : null,
      // Mask the SMTP host (not a secret, but no need to show full value)
      smtpHost: maskId('SMTP_HOST', env),
      fromEmail: maskId('SMTP_FROM', env) ?? maskId('RESEND_FROM', env),
    },

    sms: {
      /** Whether a SMS provider is configured. */
      configured: false, // Phase 5-4: phone login not yet implemented
    },

    billing: {
      byokAllowed,
      byokGatewayFeeEnabled: env.BYOK_GATEWAY_FEE_ENABLED === 'true',
      signupCreditGrant: Number.parseInt(env.SIGNUP_CREDIT_GRANT ?? '0', 10) || 0,
    },

    /**
     * Platform LLM keys: env and/or DB. Only `configured` booleans + non-secret
     * baseURL/region — never secret values.
     */
    llm: {
      byokAllowed,
      configuredCount: llmProviders.filter((p) => p.configured).length,
      providers: llmProviders,
      totalProviders: llmProviders.length,
    },
  };
};

const updateLlmProviderInput = z.object({
  accessKeyId: z.string().optional(),
  apiKey: z.string().optional(),
  baseURL: z.string().nullable().optional(),
  clearSecrets: z.boolean().optional(),
  enabled: z.boolean().optional(),
  providerId: z.string().min(1),
  region: z.string().nullable().optional(),
  secretAccessKey: z.string().optional(),
  sessionToken: z.string().optional(),
});

export const adminConfigRouter = router({
  /**
   * Returns configuration status for all commercial integrations.
   * Secret values are replaced with boolean `configured` flags.
   */
  status: adminProcedure.query(async ({ ctx }) => {
    let llmDbRows: BuildAdminConfigStatusOptions['llmDbRows'];
    try {
      const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
      llmDbRows = await SystemLlmProviderModel.listAll(ctx.serverDB, gateKeeper);
    } catch {
      llmDbRows = [];
    }
    return buildAdminConfigStatus(process.env, { llmDbRows });
  }),

  /**
   * Upsert platform LLM credentials for one provider.
   * Empty apiKey / secret fields are ignored (do not wipe existing secrets).
   * Pass clearSecrets=true to remove stored secrets while keeping baseURL/region.
   */
  updateLlmProvider: adminProcedure
    .input(updateLlmProviderInput)
    .mutation(async ({ ctx, input }) => {
      const meta = LLM_PROVIDER_STATUS.find((p) => p.id === input.providerId);
      if (!meta) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown LLM provider' });
      }

      let gateKeeper: Awaited<ReturnType<typeof KeyVaultsGateKeeper.initWithEnvKey>>;
      try {
        gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
      } catch {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'KEY_VAULTS_SECRET is not configured; cannot store encrypted platform keys.',
        });
      }

      const existing = await SystemLlmProviderModel.findByProvider(
        ctx.serverDB,
        input.providerId,
        gateKeeper,
      );

      const patch: SystemLlmCredentials = {
        accessKeyId: input.accessKeyId,
        apiKey: input.apiKey,
        baseURL: input.baseURL === null ? undefined : input.baseURL,
        region: input.region === null ? undefined : input.region,
        secretAccessKey: input.secretAccessKey,
        sessionToken: input.sessionToken,
      };

      const credentials = mergeLlmCredentialUpdate(existing?.credentials ?? {}, patch, {
        clearSecrets: input.clearSecrets,
      });

      const enabled = input.enabled ?? existing?.enabled ?? true;

      await SystemLlmProviderModel.upsertByProvider(
        ctx.serverDB,
        {
          credentials,
          enabled,
          provider: input.providerId,
        },
        gateKeeper,
      );

      // Never echo secrets — return the same shape as status row.
      const status = buildAdminConfigStatus(process.env, {
        llmDbRows: [
          {
            credentials,
            enabled,
            provider: input.providerId,
          },
          ...(
            await SystemLlmProviderModel.listAll(ctx.serverDB, gateKeeper).catch(() => [])
          ).filter((row) => row.provider !== input.providerId),
        ],
      });

      return status.llm.providers.find((p) => p.id === input.providerId)!;
    }),
});
