/**
 * StripePaymentService — thin adapter between the Wedai order domain and the
 * Stripe SDK.  Only this file and the webhook route import from 'stripe'.
 *
 * Architecture boundary:
 *  - The billing domain package (@lobechat/billing) MUST NOT import this file.
 *  - Application middleware calls this adapter, then passes the result to
 *    billing domain commands.
 */
import Stripe from 'stripe';

import type { PriceSnapshot } from '@lobechat/billing';

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Stripe client (lazy; throws if key absent at call time)
// ─────────────────────────────────────────────────────────────────────────────

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  _stripe = new Stripe(key, { apiVersion: '2025-06-30.basil', typescript: true });
  return _stripe;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CheckoutSessionParams {
  /** Internal order ID used as idempotency key and metadata. */
  orderId: string;
  /** Internal order number shown to the user. */
  orderNo: string;
  /** Price snapshot read from the server (never trusted from the client). */
  priceSnapshot: PriceSnapshot;
  /** Absolute URL that Stripe redirects to on success. */
  successUrl: string;
  /** Absolute URL that Stripe redirects to on cancel. */
  cancelUrl: string;
  /** Stripe customer ID, if the user has one. */
  stripeCustomerId?: string;
}

export interface CheckoutSessionResult {
  /** Stripe checkout session ID, e.g. cs_test_xxx */
  sessionId: string;
  /** URL to redirect the user to. */
  url: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class StripePaymentService {
  /**
   * Creates a Stripe Checkout Session for a single payment.
   *
   * The amount is taken from `priceSnapshot.amountMinor` (server-computed);
   * the client never passes an amount.
   *
   * Idempotency: Stripe idempotency key = `checkout:${orderId}` ensures a
   * retry of a failed request returns the same session rather than creating
   * a duplicate charge.
   */
  static async createCheckoutSession(
    params: CheckoutSessionParams,
  ): Promise<CheckoutSessionResult> {
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: params.priceSnapshot.currency.toLowerCase(),
              unit_amount: Number(params.priceSnapshot.amountMinor),
              product_data: {
                name: `Order ${params.orderNo}`,
              },
            },
          },
        ],
        metadata: {
          /**
           * IMPORTANT: The webhook verifies order ownership using this field.
           * It is set server-side here and never trusted from user input.
           */
          orderId: params.orderId,
          orderNo: params.orderNo,
        },
        customer: params.stripeCustomerId,
        client_reference_id: params.orderId,
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
      },
      { idempotencyKey: `checkout:${params.orderId}` },
    );

    if (!session.url) throw new Error('Stripe did not return a checkout URL');

    return { sessionId: session.id, url: session.url };
  }

  /**
   * Verifies the Stripe webhook signature and returns the typed event.
   *
   * MUST be called with the raw (unparsed) request body bytes.
   * Any attempt to JSON.parse before calling this will break the signature.
   *
   * @throws Stripe.errors.StripeSignatureVerificationError on invalid/expired signature.
   */
  static constructWebhookEvent(rawBody: string | Buffer, signature: string): Stripe.Event {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
    return getStripe().webhooks.constructEvent(rawBody, signature, secret);
  }
}
