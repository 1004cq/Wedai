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
    },
    runtimeEnv: {
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    },
  });
};

export type PaymentConfig = ReturnType<typeof getPaymentConfig>;
