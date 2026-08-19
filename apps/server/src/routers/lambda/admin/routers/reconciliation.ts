/**
 * admin.reconciliation — read-only local + optional Stripe payment reconciliation.
 *
 * Detects:
 *  - pending_timeout:     pending orders older than threshold within the window
 *  - paid_missing_credit: paid orders with creditGrant > 0 but no credit ledger row
 *
 * Never mutates orders, ledger, or wallets. Safe to re-run.
 */
import { z } from 'zod';

import {
  DEFAULT_LOOKBACK_HOURS,
  DEFAULT_PENDING_TIMEOUT_MINUTES,
  PaymentReconciliation,
} from '@/database/models/paymentReconciliation';
import { router } from '@/libs/trpc/lambda';
import { StripePaymentService } from '@/server/services/payment/StripePaymentService';
import { StripeReconciliationEnricher } from '@/server/services/payment/StripeReconciliationEnricher';

import { adminProcedure } from '../middleware';

export const adminReconciliationRouter = router({
  /**
   * Generates a structured reconciliation report for the given time window.
   *
   * When STRIPE_SECRET_KEY is configured, discrepancy orders are enriched with
   * Checkout Session / PaymentIntent status. Without the key, local checks still
   * run and stripe.skipped=true is noted per issue.
   */
  report: adminProcedure
    .input(
      z.object({
        lookbackHours: z.number().min(1).max(720).default(DEFAULT_LOOKBACK_HOURS),
        pendingTimeoutMinutes: z
          .number()
          .min(1)
          .max(10_080)
          .default(DEFAULT_PENDING_TIMEOUT_MINUTES),
        /** When false, skip Stripe API calls even if STRIPE_SECRET_KEY is set. */
        includeStripeLookup: z.boolean().default(true),
      }),
    )
    .query(async ({ ctx, input }) => {
      const reconciler = new PaymentReconciliation(ctx.serverDB);
      const baseReport = await reconciler.run({
        lookbackHours: input.lookbackHours,
        pendingTimeoutMinutes: input.pendingTimeoutMinutes,
      });

      if (!input.includeStripeLookup) {
        return {
          ...baseReport,
          stripeEnrichment: 'skipped_no_key' as const,
        };
      }

      if (baseReport.issues.length === 0) {
        return {
          ...baseReport,
          stripeEnrichment: StripePaymentService.isConfigured()
            ? ('enabled' as const)
            : ('skipped_no_key' as const),
        };
      }

      const enricher = new StripeReconciliationEnricher();
      const { issues, stripeEnrichment } = await enricher.enrichIssues(baseReport.issues);

      return {
        ...baseReport,
        issues,
        stripeEnrichment,
      };
    }),
});
