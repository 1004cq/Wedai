/**
 * StripeReconciliationEnricher — optional Stripe API lookups for discrepancy orders.
 *
 * Read-only. Never mutates local or Stripe state.
 * Skips gracefully when STRIPE_SECRET_KEY is absent.
 */
import type { ReconciliationIssue } from '@/database/models/paymentReconciliation';
import {
  type StripeCheckoutLookup,
  type StripePaymentIntentLookup,
  StripePaymentService,
} from '@/server/services/payment/StripePaymentService';

export type StripeEnrichmentStatus = 'enabled' | 'skipped_no_key' | 'partial';

export interface StripeEnrichment {
  paymentIntent?: StripePaymentIntentLookup | null;
  session?: StripeCheckoutLookup | null;
  skipped: boolean;
  skipReason?: string;
}

export interface ReconciliationIssueWithStripe extends ReconciliationIssue {
  stripe?: StripeEnrichment;
}

export interface EnrichedPaymentReconciliationReport {
  issues: ReconciliationIssueWithStripe[];
  stripeEnrichment: StripeEnrichmentStatus;
}

export class StripeReconciliationEnricher {
  /**
   * Enriches reconciliation issues with Stripe Session/PI status when configured.
   */
  async enrichIssues(issues: ReconciliationIssue[]): Promise<{
    stripeEnrichment: StripeEnrichmentStatus;
    issues: ReconciliationIssueWithStripe[];
  }> {
    if (!StripePaymentService.isConfigured()) {
      return {
        issues: issues.map((issue) => ({
          ...issue,
          stripe: {
            skipReason: 'STRIPE_SECRET_KEY not configured',
            skipped: true,
          },
        })),
        stripeEnrichment: 'skipped_no_key',
      };
    }

    let partial = false;
    const enriched: ReconciliationIssueWithStripe[] = [];

    for (const issue of issues) {
      try {
        const session = await StripePaymentService.lookupCheckoutSessionByOrderId(issue.orderId);
        let paymentIntent: StripePaymentIntentLookup | null = null;

        if (session?.paymentIntentId) {
          paymentIntent = await StripePaymentService.lookupPaymentIntent(session.paymentIntentId);
        }

        enriched.push({
          ...issue,
          stripe: {
            paymentIntent,
            session,
            skipped: false,
          },
        });
      } catch {
        partial = true;
        enriched.push({
          ...issue,
          stripe: {
            skipReason: 'stripe_lookup_failed',
            skipped: true,
          },
        });
      }
    }

    return {
      issues: enriched,
      stripeEnrichment: partial ? 'partial' : 'enabled',
    };
  }
}
