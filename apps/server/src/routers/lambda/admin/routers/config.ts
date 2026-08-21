/**
 * admin.config — read-only system configuration status.
 *
 * SECURITY CONTRACT (P3-1):
 *  - Secret values are NEVER returned — only a boolean `configured` flag.
 *  - Masked display (e.g. "sk_test_••••1234") is acceptable for non-secret
 *    identifiers (app IDs, endpoints) but must never show the full value.
 *  - Only `adminProcedure` callers (role='admin' in DB) may read this.
 *  - Ordinary users and unauthenticated callers receive FORBIDDEN.
 *
 * Why read-only here: modifying secrets via tRPC requires careful update
 * semantics (only overwrite when non-empty string submitted). That's a
 * Phase 3 follow-up; for now admins configure secrets via environment
 * variables or a secrets manager.
 */
import { router } from '@/libs/trpc/lambda';

import { adminProcedure } from '../middleware';

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

/** Curated platform LLM env keys shown in admin (configured flags only). */
export const LLM_PROVIDER_STATUS = [
  { envKey: 'OPENAI_API_KEY', id: 'openai', label: 'OpenAI' },
  { envKey: 'ANTHROPIC_API_KEY', id: 'anthropic', label: 'Anthropic' },
  { envKey: 'GOOGLE_API_KEY', id: 'google', label: 'Google' },
  { envKey: 'AZURE_API_KEY', id: 'azure', label: 'Azure OpenAI' },
  { envKey: 'DEEPSEEK_API_KEY', id: 'deepseek', label: 'DeepSeek' },
  { envKey: 'ZHIPU_API_KEY', id: 'zhipu', label: '智谱 Zhipu' },
  { envKey: 'MOONSHOT_API_KEY', id: 'moonshot', label: 'Moonshot / Kimi' },
  { envKey: 'QWEN_API_KEY', id: 'qwen', label: '通义千问 Qwen' },
  { envKey: 'VOLCENGINE_API_KEY', id: 'volcengine', label: '火山引擎' },
  { envKey: 'MINIMAX_API_KEY', id: 'minimax', label: 'MiniMax' },
  { envKey: 'OPENROUTER_API_KEY', id: 'openrouter', label: 'OpenRouter' },
  { envKey: 'GROQ_API_KEY', id: 'groq', label: 'Groq' },
  { envKey: 'MISTRAL_API_KEY', id: 'mistral', label: 'Mistral' },
  { envKey: 'PERPLEXITY_API_KEY', id: 'perplexity', label: 'Perplexity' },
  { envKey: 'AWS_ACCESS_KEY_ID', id: 'bedrock', label: 'AWS Bedrock' },
] as const;

/** Pure builder — unit-tested without adminProcedure / DB. */
export const buildAdminConfigStatus = (env: NodeJS.ProcessEnv = process.env) => {
  const llmProviders = LLM_PROVIDER_STATUS.map(({ envKey, id, label }) => ({
    configured: isSet(envKey, env),
    envKey,
    id,
    label,
  }));

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
     * Platform LLM keys live in server env (not editable here in Phase 1).
     * Only `configured` booleans — never secret values.
     */
    llm: {
      byokAllowed,
      configuredCount: llmProviders.filter((p) => p.configured).length,
      providers: llmProviders,
      totalProviders: llmProviders.length,
    },
  };
};

export const adminConfigRouter = router({
  /**
   * Returns configuration status for all commercial integrations.
   * Secret values are replaced with boolean `configured` flags.
   */
  status: adminProcedure.query(() => buildAdminConfigStatus()),
});
