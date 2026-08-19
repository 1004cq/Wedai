/**
 * StripeWebhookService — full idempotent webhook processing pipeline.
 *
 * Implements the invariants from WEBHOOK_IDEMPOTENCY.md §3:
 *
 *  1. Caller MUST verify the Stripe signature BEFORE calling processEvent().
 *  2. Insert webhook_events (provider, event_id) ON CONFLICT DO NOTHING.
 *  3. If same event_id exists but payload_hash differs → alert + reject.
 *  4. SELECT ... FOR UPDATE the event row (serialise concurrent deliveries).
 *  5. If already processed/ignored → return idempotently.
 *  6. Mark processing, lock order row FOR UPDATE.
 *  7. Validate amount, currency, order ownership, current state.
 *  8. Execute state transition (pending → paid) and credit ledger atomically.
 *  9. Mark event processed; commit once.
 *
 * Transaction boundary: steps 4-9 run in a single DB transaction.
 *
 * Failure modes:
 *  - Invalid signature:        caller returns 400 before this service is called
 *  - payload_hash mismatch:    rejects + marks event failed + alerts
 *  - amount/currency mismatch: marks event failed + alerts; returns 200 to stop
 *                              Stripe from retrying a genuinely bad event
 *  - DB transient error:       throws → caller returns 500 → Stripe retries
 */
import crypto from 'node:crypto';

import { TRPCError } from '@trpc/server';
import { and, eq, sql } from 'drizzle-orm';
import Stripe from 'stripe';

import { BillingCommandService } from '@lobechat/billing';
import type { LobeChatDatabase } from '@lobechat/database';
import {
  BillingAccountModel,
  OrderModel,
  WebhookEventModel,
  billingAccounts,
  orders,
  webhookEvents,
} from '@lobechat/database';

// ─────────────────────────────────────────────────────────────────────────────
// Supported event types
// ─────────────────────────────────────────────────────────────────────────────

/** Events that trigger a payment completion flow. */
const PAYMENT_SUCCESS_EVENTS = new Set([
  'checkout.session.completed',
  'payment_intent.succeeded',
]);

/** Events that trigger a payment failure / closure flow. */
const PAYMENT_FAILURE_EVENTS = new Set([
  'checkout.session.expired',
  'payment_intent.payment_failed',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Result types
// ─────────────────────────────────────────────────────────────────────────────

export type WebhookProcessResult =
  | { outcome: 'processed'; orderId: string; ledgerEntryId: string }
  | { outcome: 'idempotent'; orderId: string }
  | { outcome: 'ignored'; reason: string }
  | { outcome: 'failed'; reason: string; alert: boolean };

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class StripeWebhookService {
  private readonly wem: WebhookEventModel;

  constructor(private readonly db: LobeChatDatabase) {
    this.wem = new WebhookEventModel(db);
  }

  /**
   * Main entry point.  Caller must have already verified the Stripe signature.
   *
   * @param event   The Stripe.Event returned by `constructEvent`.
   * @param rawBody The original request body string (for hashing).
   */
  async processEvent(event: Stripe.Event, rawBody: string): Promise<WebhookProcessResult> {
    const payloadHash = sha256(rawBody);

    // ── Step 1: register event (idempotent INSERT) ────────────────────────────
    const { isNew, event: webhookRow } = await this.wem.upsert({
      provider: 'stripe',
      eventId: event.id,
      eventType: event.type,
      payload: scrubPayload(event),
      payloadHash,
    } as Parameters<WebhookEventModel['upsert']>[0]);

    // ── Step 2: payload-hash integrity check ─────────────────────────────────
    if (!isNew && webhookRow.payloadHash && webhookRow.payloadHash !== payloadHash) {
      // Same event_id but different body — security anomaly.
      await this.wem.markFailed(webhookRow.id, 'payload_hash_mismatch');
      console.error('[stripe-webhook] ALERT: payload hash mismatch', {
        eventId: event.id,
        stored: webhookRow.payloadHash,
        received: payloadHash,
      });
      return { outcome: 'failed', reason: 'payload_hash_mismatch', alert: true };
    }

    // ── Step 3: unknown event type → ignore (2xx, zero funds) ────────────────
    const isSuccess = PAYMENT_SUCCESS_EVENTS.has(event.type);
    const isFailure = PAYMENT_FAILURE_EVENTS.has(event.type);

    if (!isSuccess && !isFailure) {
      await this.wem.markIgnored(webhookRow.id);
      return { outcome: 'ignored', reason: `unhandled event type: ${event.type}` };
    }

    // ── Step 4-9: atomic business transaction ─────────────────────────────────
    return this.db.transaction(async (tx) => {
      // 4. Lock the event row to serialise concurrent deliveries.
      const [lockedEvent] = await tx
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.id, webhookRow.id))
        .for('update')
        .limit(1);

      // 5. Already terminal → return idempotently without touching funds.
      if (lockedEvent.status === 'processed' || lockedEvent.status === 'ignored') {
        const orderId = lockedEvent.orderId ?? '';
        return { outcome: 'idempotent', orderId };
      }

      // Mark processing + increment attempt inside the same transaction.
      await tx
        .update(webhookEvents)
        .set({
          status: 'pending',
          processingStartedAt: new Date(),
          attemptCount: sql`${webhookEvents.attemptCount} + 1`,
        })
        .where(eq(webhookEvents.id, webhookRow.id));

      // 6. Extract orderId from Stripe metadata (server-set at checkout creation).
      const orderId = extractOrderId(event);
      if (!orderId) {
        await tx
          .update(webhookEvents)
          .set({ status: 'failed', failureReason: 'missing_order_id_in_metadata' })
          .where(eq(webhookEvents.id, webhookRow.id));
        return { outcome: 'failed', reason: 'missing_order_id_in_metadata', alert: true };
      }

      // 7. Lock the order row.
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .for('update')
        .limit(1);

      if (!order) {
        await tx
          .update(webhookEvents)
          .set({ status: 'failed', failureReason: 'order_not_found' })
          .where(eq(webhookEvents.id, webhookRow.id));
        return { outcome: 'failed', reason: 'order_not_found', alert: true };
      }

      // Validate amount, currency (never trust the Stripe payload — cross-check local order).
      if (isSuccess) {
        const stripeAmount = extractAmount(event);
        const stripeCurrency = extractCurrency(event);

        if (stripeAmount !== null && stripeAmount !== Number(order.amountMinor)) {
          const reason = `amount_mismatch: expected ${order.amountMinor}, got ${stripeAmount}`;
          await tx
            .update(webhookEvents)
            .set({ status: 'failed', failureReason: reason })
            .where(eq(webhookEvents.id, webhookRow.id));
          console.error('[stripe-webhook] ALERT: amount mismatch', { orderId, stripeAmount, expected: order.amountMinor });
          return { outcome: 'failed', reason, alert: true };
        }

        if (stripeCurrency && stripeCurrency.toUpperCase() !== order.currency.toUpperCase()) {
          const reason = `currency_mismatch: expected ${order.currency}, got ${stripeCurrency}`;
          await tx
            .update(webhookEvents)
            .set({ status: 'failed', failureReason: reason })
            .where(eq(webhookEvents.id, webhookRow.id));
          console.error('[stripe-webhook] ALERT: currency mismatch', { orderId });
          return { outcome: 'failed', reason, alert: true };
        }
      }

      // 8. State machine enforcement.
      // paid is a terminal state — late failure/closed events must not downgrade it.
      if (order.status === 'paid') {
        if (!isSuccess) {
          console.warn('[stripe-webhook] late failure event ignored for paid order', { orderId, eventType: event.type });
        }
        await tx
          .update(webhookEvents)
          .set({ status: 'ignored', processedAt: new Date(), orderId })
          .where(eq(webhookEvents.id, webhookRow.id));
        return { outcome: 'idempotent', orderId };
      }

      if (order.status !== 'pending') {
        // closed or failed — unknown late success from provider; alert for manual review.
        if (isSuccess) {
          await tx
            .update(webhookEvents)
            .set({ status: 'failed', failureReason: `unexpected_success_for_${order.status}_order` })
            .where(eq(webhookEvents.id, webhookRow.id));
          return { outcome: 'failed', reason: `order_in_${order.status}_state`, alert: true };
        }
        // Late close/fail for already-closed/failed order → ignore.
        await tx
          .update(webhookEvents)
          .set({ status: 'ignored', processedAt: new Date(), orderId })
          .where(eq(webhookEvents.id, webhookRow.id));
        return { outcome: 'idempotent', orderId };
      }

      // 9. Execute transition + ledger inside the same transaction.
      if (isSuccess) {
        // Transition order to paid.
        await tx
          .update(orders)
          .set({ status: 'paid', paidAt: new Date() })
          .where(and(eq(orders.id, orderId), eq(orders.status, 'pending')));

        // Look up billing account for this order.
        const [billingAcc] = await tx
          .select()
          .from(billingAccounts)
          .where(eq(billingAccounts.id, order.billingAccountId))
          .limit(1);

        if (!billingAcc) throw new TRPCError({ code: 'NOT_FOUND', message: 'billing account not found' });

        // Credit the wallet with the grant from the price snapshot.
        const priceSnap = order.priceSnapshot as { creditGrant?: string };
        const creditGrant = priceSnap?.creditGrant ? BigInt(priceSnap.creditGrant) : BigInt(0);

        let ledgerEntryId = '';
        if (creditGrant > 0n) {
          const billingService = new BillingCommandService(tx as unknown as LobeChatDatabase);
          const creditResult = await billingService.credit({
            billingAccountId: billingAcc.id,
            credits: creditGrant,
            orderId: order.id,
            idempotencyKey: `payment:stripe:${event.id}:credit`,
            reason: `order paid: ${order.orderNo}`,
          });
          ledgerEntryId = creditResult.ledgerEntryId;
        }

        // Mark event row processed and link to order.
        await tx
          .update(webhookEvents)
          .set({ status: 'processed', processedAt: new Date(), orderId })
          .where(eq(webhookEvents.id, webhookRow.id));

        return { outcome: 'processed', orderId, ledgerEntryId };
      }

      // isFailure — close or fail the order.
      const nextStatus = event.type === 'checkout.session.expired' ? 'closed' : 'failed';
      await tx
        .update(orders)
        .set({ status: nextStatus, closedAt: nextStatus === 'closed' ? new Date() : undefined })
        .where(and(eq(orders.id, orderId), eq(orders.status, 'pending')));

      await tx
        .update(webhookEvents)
        .set({ status: 'processed', processedAt: new Date(), orderId })
        .where(eq(webhookEvents.id, webhookRow.id));

      return { outcome: 'processed', orderId, ledgerEntryId: '' };
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sha256(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

/** Removes PII / secrets from the event before persisting the payload. */
function scrubPayload(event: Stripe.Event): Record<string, unknown> {
  // Persist only the minimum fields needed for debugging and reconciliation.
  // Full card data, customer email, and raw metadata with user PII are omitted.
  return {
    id: event.id,
    type: event.type,
    created: event.created,
    livemode: event.livemode,
    // Retain top-level metadata fields used for order lookup, scrub the rest.
    object_id: (event.data.object as any)?.id,
    object_status: (event.data.object as any)?.status,
    amount_total: (event.data.object as any)?.amount_total,
    currency: (event.data.object as any)?.currency,
    metadata_order_id: (event.data.object as any)?.metadata?.orderId,
  };
}

/** Extracts the internal orderId from Stripe event metadata. */
function extractOrderId(event: Stripe.Event): string | null {
  const obj = event.data.object as any;
  return obj?.metadata?.orderId ?? obj?.metadata?.order_id ?? null;
}

/** Extracts the total amount in minor units (integer) from the Stripe event. */
function extractAmount(event: Stripe.Event): number | null {
  const obj = event.data.object as any;
  // checkout.session.completed → amount_total
  // payment_intent.succeeded  → amount_received
  return obj?.amount_total ?? obj?.amount_received ?? null;
}

/** Extracts the ISO currency code from the Stripe event. */
function extractCurrency(event: Stripe.Event): string | null {
  const obj = event.data.object as any;
  return obj?.currency ?? null;
}
