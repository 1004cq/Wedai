/**
 * Stripe webhook endpoint
 *
 * Route: POST /api/webhooks/stripe
 *
 * HTTP response semantics (WEBHOOK_IDEMPOTENCY.md §3.3):
 *
 *   400  Signature missing or invalid / expired timestamp
 *        → Stripe does NOT retry (400 is not a retryable status)
 *        → Zero DB writes
 *
 *   200  { received: true, outcome: 'processed' | 'idempotent' | 'ignored' }
 *        → Normal success / duplicate delivery / unknown event type
 *
 *   200  { received: true, outcome: 'rejected', reason: string }
 *        → Signature valid but business validation failed (amount mismatch,
 *          hash mismatch, order not found, etc.)
 *        → Stripe STOPS retrying — re-delivery cannot fix a business anomaly
 *        → Alert is logged server-side; human review required
 *
 *   500  { error: 'internal server error' }
 *        → Transient DB error / infrastructure failure
 *        → Stripe WILL retry according to its retry schedule
 *
 *   503  { error: 'database unavailable' }
 *        → DB connection failure at startup
 *        → Stripe retries
 *
 * Log field convention (no secrets / PII):
 *   eventId, eventType, outcome, reason, durationMs, livemode, orderId,
 *   ledgerEntryId, attemptCount, webhookRowId
 *   FORBIDDEN: STRIPE_WEBHOOK_SECRET, card numbers, customer email, raw payload
 */
import debug from 'debug';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';

import { getServerDB } from '@/database/core/db-adaptor';
import { StripePaymentService } from '@/server/services/payment/StripePaymentService';
import { StripeWebhookService } from '@/server/services/payment/StripeWebhookService';

const log = debug('lobe-server:webhook:stripe:route');

export const config = {
  api: { bodyParser: false },
};

export const POST = async (req: NextRequest): Promise<NextResponse> => {
  const startMs = Date.now();

  // ── 1. Read raw body ──────────────────────────────────────────────────────
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: 'failed to read request body' }, { status: 400 });
  }

  // ── 2. Signature header present? ─────────────────────────────────────────
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    console.warn('[stripe-webhook] 400 missing_signature', {
      durationMs: Date.now() - startMs,
      outcome: 'rejected',
      reason: 'missing_stripe_signature_header',
    });
    return NextResponse.json({ error: 'missing stripe-signature header' }, { status: 400 });
  }

  // ── 3. Verify signature ───────────────────────────────────────────────────
  let event: Stripe.Event;
  try {
    event = StripePaymentService.constructWebhookEvent(rawBody, signature);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.warn('[stripe-webhook] 400 signature_verification_failed', {
      durationMs: Date.now() - startMs,
      outcome: 'rejected',
      reason: 'signature_verification_failed',
      // message may mention timestamp tolerance — safe to log, no secrets.
      verificationError: message.slice(0, 120),
    });
    return NextResponse.json({ error: 'webhook signature verification failed' }, { status: 400 });
  }

  log('route:event_verified %O', {
    eventId: event.id,
    eventType: event.type,
    livemode: event.livemode,
  });

  // ── 4. Connect to DB ──────────────────────────────────────────────────────
  let db: Awaited<ReturnType<typeof getServerDB>>;
  try {
    db = await getServerDB();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[stripe-webhook] 503 database_unavailable', {
      durationMs: Date.now() - startMs,
      eventId: event.id,
      eventType: event.type,
      outcome: 'retryable',
      reason: 'database_unavailable',
    });
    return NextResponse.json({ error: 'database unavailable' }, { status: 503 });
  }

  // ── 5. Process event ──────────────────────────────────────────────────────
  const service = new StripeWebhookService(db);

  let result: Awaited<ReturnType<StripeWebhookService['processEvent']>>;
  try {
    result = await service.processEvent(event, rawBody);
  } catch (err) {
    // Transient DB error — 500 so Stripe retries.
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[stripe-webhook] 500 processing_error_retryable', {
      durationMs: Date.now() - startMs,
      eventId: event.id,
      eventType: event.type,
      // Truncate to avoid leaking stack frames with env paths
      errorMessage: message.slice(0, 200),
      outcome: 'retryable',
    });
    return NextResponse.json({ error: 'internal server error' }, { status: 500 });
  }

  const durationMs = Date.now() - startMs;

  // ── 6. Respond ────────────────────────────────────────────────────────────
  if (result.outcome === 'failed' && result.alert) {
    // Business validation failure — stop Stripe retrying (200 not 4xx).
    console.error('[stripe-webhook] 200 rejected_alert', {
      durationMs,
      eventId: event.id,
      eventType: event.type,
      outcome: 'rejected',
      reason: result.reason,
    });
    return NextResponse.json({
      outcome: 'rejected',
      reason: result.reason,
      received: true,
    });
  }

  log('route:done %O', {
    durationMs,
    eventId: event.id,
    eventType: event.type,
    ledgerEntryId: 'ledgerEntryId' in result ? result.ledgerEntryId || null : null,
    orderId: 'orderId' in result ? result.orderId || null : null,
    outcome: result.outcome,
  });

  return NextResponse.json({ outcome: result.outcome, received: true });
};
