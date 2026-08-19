/**
 * StripeReconciliationEnricher unit tests.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReconciliationIssue } from '@/database/models/paymentReconciliation';
import { StripePaymentService } from '@/server/services/payment/StripePaymentService';

import { StripeReconciliationEnricher } from '../StripeReconciliationEnricher';

vi.mock('@/server/services/payment/StripePaymentService', () => ({
  StripePaymentService: {
    isConfigured: vi.fn(),
    lookupCheckoutSessionByOrderId: vi.fn(),
    lookupPaymentIntent: vi.fn(),
  },
}));

const baseIssue: ReconciliationIssue = {
  createdAt: new Date().toISOString(),
  creditGrant: '1000',
  issueType: 'paid_missing_credit',
  orderId: 'ord_test_1',
  orderNo: 'ORD-TEST-001',
  paidAt: new Date().toISOString(),
  pendingAgeMinutes: null,
  status: 'paid',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StripeReconciliationEnricher', () => {
  it('skips enrichment when STRIPE_SECRET_KEY is not configured', async () => {
    vi.mocked(StripePaymentService.isConfigured).mockReturnValue(false);

    const enricher = new StripeReconciliationEnricher();
    const result = await enricher.enrichIssues([baseIssue]);

    expect(result.stripeEnrichment).toBe('skipped_no_key');
    expect(result.issues[0].stripe).toEqual({
      skipReason: 'STRIPE_SECRET_KEY not configured',
      skipped: true,
    });
    expect(StripePaymentService.lookupCheckoutSessionByOrderId).not.toHaveBeenCalled();
  });

  it('enriches issues with session and payment intent when configured', async () => {
    vi.mocked(StripePaymentService.isConfigured).mockReturnValue(true);
    vi.mocked(StripePaymentService.lookupCheckoutSessionByOrderId).mockResolvedValue({
      paymentIntentId: 'pi_test_1',
      paymentStatus: 'paid',
      sessionId: 'cs_test_1',
      sessionStatus: 'complete',
    });
    vi.mocked(StripePaymentService.lookupPaymentIntent).mockResolvedValue({
      paymentIntentId: 'pi_test_1',
      status: 'succeeded',
    });

    const enricher = new StripeReconciliationEnricher();
    const result = await enricher.enrichIssues([baseIssue]);

    expect(result.stripeEnrichment).toBe('enabled');
    expect(result.issues[0].stripe).toEqual({
      paymentIntent: { paymentIntentId: 'pi_test_1', status: 'succeeded' },
      session: {
        paymentIntentId: 'pi_test_1',
        paymentStatus: 'paid',
        sessionId: 'cs_test_1',
        sessionStatus: 'complete',
      },
      skipped: false,
    });
  });

  it('marks partial when a Stripe lookup throws', async () => {
    vi.mocked(StripePaymentService.isConfigured).mockReturnValue(true);
    vi.mocked(StripePaymentService.lookupCheckoutSessionByOrderId).mockRejectedValue(
      new Error('network'),
    );

    const enricher = new StripeReconciliationEnricher();
    const result = await enricher.enrichIssues([baseIssue]);

    expect(result.stripeEnrichment).toBe('partial');
    expect(result.issues[0].stripe?.skipped).toBe(true);
    expect(result.issues[0].stripe?.skipReason).toBe('stripe_lookup_failed');
  });
});
