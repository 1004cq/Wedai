/**
 * Wedai commercial payment environment variables.
 *
 * Rules:
 *  - All secret keys are server-only; NEVER use NEXT_PUBLIC_ prefix.
 *  - Only NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY may be exposed to the client.
 *  - Variable presence is validated at server startup; missing required vars
 *    fail loudly rather than silently swallowing payment errors.
 */
import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const getPaymentConfig = () => {
  return createEnv({
    clientPrefix: 'NEXT_PUBLIC_',
    client: {
      /**
       * Stripe publishable key — safe to expose to the browser.
       * Used by @stripe/stripe-js to initialise the Stripe.js client.
       * Example: pk_test_xxx (test) / pk_live_xxx (production)
       */
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
    },
    server: {
      /**
       * Stripe secret key — server-only.
       * Used to create PaymentIntents, Checkout Sessions, etc.
       * Example: sk_test_xxx (test) / sk_live_xxx (production)
       */
      STRIPE_SECRET_KEY: z.string().optional(),

      /**
       * Stripe webhook endpoint secret — server-only.
       * Used to verify the Stripe-Signature header on every webhook delivery.
       * Obtain from: stripe listen --print-secret (local) or Stripe Dashboard (prod).
       * Example: whsec_xxx
       */
      STRIPE_WEBHOOK_SECRET: z.string().optional(),

      /**
       * Credit units to grant every new user upon registration (integer).
       * Set to 0 or omit to disable the welcome grant.
       * Example: 100000  → 100 000 credits on signup
       */
      SIGNUP_CREDIT_GRANT: z.coerce.number().int().nonnegative().default(0),

      /**
       * When true, requests using user-supplied API keys (BYOK) are charged a
       * small platform gateway surcharge in addition to the provider fee.
       * Default: false — BYOK requests cost the user nothing on the platform.
       */
      BYOK_GATEWAY_FEE_ENABLED: z.coerce.boolean().default(false),

      /**
       * When false, users may supply their own API keys to bypass platform billing.
       * Set to true to force all requests through platform billing (e.g. enterprise).
       * Default: true — BYOK is allowed.
       */
      BYOK_ALLOWED: z.coerce.boolean().default(true),
    },
    runtimeEnv: {
      BYOK_ALLOWED: process.env.BYOK_ALLOWED,
      BYOK_GATEWAY_FEE_ENABLED: process.env.BYOK_GATEWAY_FEE_ENABLED,
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      SIGNUP_CREDIT_GRANT: process.env.SIGNUP_CREDIT_GRANT,
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    },
  });
};

export type PaymentConfig = ReturnType<typeof getPaymentConfig>;
