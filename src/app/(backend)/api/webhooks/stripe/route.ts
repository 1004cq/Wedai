/**
 * Stripe webhook endpoint
 *
 * Route: POST /api/webhooks/stripe
 *
 * Security requirements (WEBHOOK_IDEMPOTENCY.md §3.1):
 *  1. Read raw body BEFORE any JSON parsing (signature covers raw bytes).
 *  2. Verify Stripe-Signature header using STRIPE_WEBHOOK_SECRET.
 *  3. On any verification error → 400; zero DB writes.
 *  4. All business logic (idempotency, state machine, ledger) is in
 *     StripeWebhookService which runs in a single DB transaction.
 *  5. Return 5xx on DB errors so Stripe retries; never swallow DB failures.
 *
 * The success URL that Stripe redirects to after payment must NOT change the
 * order status — only this endpoint may do that.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';

import { getServerDB } from '@/database/core/db-adaptor';
import { StripePaymentService } from '@/server/services/payment/StripePaymentService';
import { StripeWebhookService } from '@/server/services/payment/StripeWebhookService';

/**
 * Disable Next.js body parsing so we receive the raw bytes needed for
 * Stripe signature verification.  Changing or re-encoding the body before
 * constructEvent() will always fail signature verification.
 */
export const config = {
  api: { bodyParser: false },
};

export const POST = async (req: NextRequest): Promise<NextResponse> => {
  // ── 1. Read raw body ──────────────────────────────────────────────────────
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: 'failed to read request body' }, { status: 400 });
  }

  // ── 2. Read signature header ──────────────────────────────────────────────
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    // Missing signature — reject immediately, no DB writes.
    console.warn('[stripe-webhook] missing Stripe-Signature header');
    return NextResponse.json({ error: 'missing stripe-signature header' }, { status: 400 });
  }

  // ── 3. Verify signature (throws on invalid / expired) ────────────────────
  let event: Stripe.Event;
  try {
    event = StripePaymentService.constructWebhookEvent(rawBody, signature);
  } catch (err) {
    // Stripe.errors.StripeSignatureVerificationError or config error.
    const message = err instanceof Error ? err.message : 'unknown';
    console.warn('[stripe-webhook] signature verification failed', { message });
    // Sanitise: do not echo back any Stripe error details that might expose secrets.
    return NextResponse.json({ error: 'webhook signature verification failed' }, { status: 400 });
  }

  // ── 4. Process event ──────────────────────────────────────────────────────
  let db: Awaited<ReturnType<typeof getServerDB>>;
  try {
    db = await getServerDB();
  } catch {
    return NextResponse.json({ error: 'database unavailable' }, { status: 503 });
  }

  const service = new StripeWebhookService(db);

  let result: Awaited<ReturnType<StripeWebhookService['processEvent']>>;
  try {
    result = await service.processEvent(event, rawBody);
  } catch (err) {
    // Transient DB error — return 5xx so Stripe retries.
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[stripe-webhook] processing error (will retry)', { eventId: event.id, message });
    return NextResponse.json({ error: 'internal server error' }, { status: 500 });
  }

  // ── 5. Log outcome (no PII, no secrets) ──────────────────────────────────
  console.info('[stripe-webhook] event processed', {
    eventId: event.id,
    eventType: event.type,
    outcome: result.outcome,
    orderId: 'orderId' in result ? result.orderId : undefined,
  });

  if (result.outcome === 'failed' && result.alert) {
    // Surface high-priority alerts — in production, send to alerting system.
    console.error('[stripe-webhook] ALERT: business validation failed', {
      eventId: event.id,
      reason: result.reason,
    });
    // Return 200 to stop Stripe from retrying a genuinely invalid event.
    // A bad event will never pass validation on retry either.
    return NextResponse.json({ received: true, outcome: 'rejected', reason: result.reason });
  }

  // All outcomes (processed, idempotent, ignored) acknowledge with 200.
  return NextResponse.json({ received: true, outcome: result.outcome });
};
