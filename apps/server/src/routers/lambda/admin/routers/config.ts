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
const isSet = (name: string): boolean => {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
};

/**
 * Masks a string value, showing only the last 4 characters.
 * Returns null if the value is not set.
 * NEVER call this on a full secret key — only on non-sensitive identifiers.
 */
const maskId = (name: string): string | null => {
  const v = process.env[name];
  if (!v || v.trim().length === 0) return null;
  const trimmed = v.trim();
  return trimmed.length <= 4 ? '••••' : `••••${trimmed.slice(-4)}`;
};

export const adminConfigRouter = router({
  /**
   * Returns configuration status for all commercial integrations.
   * Secret values are replaced with boolean `configured` flags.
   */
  status: adminProcedure.query(() => {
    return {
      stripe: {
        /** Whether Stripe integration is enabled. */
        enabled: isSet('STRIPE_SECRET_KEY') && isSet('STRIPE_WEBHOOK_SECRET'),
        publishableKeyConfigured: isSet('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'),
        secretKeyConfigured: isSet('STRIPE_SECRET_KEY'),
        webhookSecretConfigured: isSet('STRIPE_WEBHOOK_SECRET'),
      },

      email: {
        /** Whether SMTP or Resend is configured for transactional email. */
        configured: isSet('SMTP_HOST') || isSet('RESEND_API_KEY'),
        provider: isSet('RESEND_API_KEY') ? 'resend' : isSet('SMTP_HOST') ? 'smtp' : null,
        // Mask the SMTP host (not a secret, but no need to show full value)
        smtpHost: maskId('SMTP_HOST'),
        fromEmail: maskId('SMTP_FROM') ?? maskId('RESEND_FROM'),
      },

      sms: {
        /** Whether a SMS provider is configured. */
        configured: false, // Phase 5-4: phone login not yet implemented
      },

      billing: {
        byokAllowed: process.env.BYOK_ALLOWED !== 'false',
        byokGatewayFeeEnabled: process.env.BYOK_GATEWAY_FEE_ENABLED === 'true',
        signupCreditGrant: Number.parseInt(process.env.SIGNUP_CREDIT_GRANT ?? '0', 10) || 0,
      },
    };
  }),
});
