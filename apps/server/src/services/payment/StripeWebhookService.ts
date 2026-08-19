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
 * ## Log field convention
 *
 * Every log line is a structured object.  Forbidden fields: any Stripe secret,
 * raw card data (card number, CVV, expiry), customer email, full Webhook payload.
 *
 * Allowed identifiers:
 *   eventId, eventType, webhookRowId, orderId, ledgerEntryId, attemptCount,
 *   outcome, reason, durationMs, livemode
 *
 * Log levels:
 *   debug  — normal flow (event registered, idempotent return)
 *   info   — terminal successes (processed)
 *   warn   — expected anomalies (late events, missing signature)
 *   error  — alerts requiring investigation (hash mismatch, amount mismatch,
 *             business validation failure, DB errors)
 */
import crypto from 'node:crypto';

import { TRPCError } from '@trpc/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import debug from 'debug';
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

const log = debug('lobe-server:stripe-webhook');

// ─────────────────────────────────────────────────────────────────────────────
// Supported event types
// ─────────────────────────────────────────────────────────────────────────────

const PAYMENT_SUCCESS_EVENTS = new Set([
  'checkout.session.completed',
  'payment_intent.succeeded',
]);

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
    const startMs = Date.now();
    const payloadHash = sha256(rawBody);

    log('processEvent:start %O', {
      eventId: event.id,
      eventType: event.type,
      livemode: event.livemode,
    });

    // ── Step 1: register event (idempotent INSERT) ────────────────────────────
    const { isNew, event: webhookRow } = await this.wem.upsert({
      provider: 'stripe',
      eventId: event.id,
      eventType: event.type,
      payload: scrubPayload(event),
      payloadHash,
    } as Parameters<WebhookEventModel['upsert']>[0]);

    log('processEvent:registered %O', {
      eventId: event.id,
      isNew,
      webhookRowId: webhookRow.id,
    });

    // ── Step 2: payload-hash integrity check ─────────────────────────────────
    if (!isNew && webhookRow.payloadHash && webhookRow.payloadHash !== payloadHash) {
      await this.wem.markFailed(webhookRow.id, 'payload_hash_mismatch');
      // ALERT: same event_id delivered with different body — security anomaly.
      // Do NOT log stored/received hashes (they are derivatives of the payload,
      // but logging both enables payload reconstruction attacks).
      console.error('[stripe-webhook] SECURITY ALERT: payload_hash_mismatch', {
        eventId: event.id,
        eventType: event.type,
        outcome: 'rejected',
        reason: 'payload_hash_mismatch',
        webhookRowId: webhookRow.id,
      });
      return { alert: true, outcome: 'failed', reason: 'payload_hash_mismatch' };
    }

    // ── Step 3: unknown event type → ignore (2xx, zero funds) ────────────────
    const isSuccess = PAYMENT_SUCCESS_EVENTS.has(event.type);
    const isFailure = PAYMENT_FAILURE_EVENTS.has(event.type);

    if (!isSuccess && !isFailure) {
      await this.wem.markIgnored(webhookRow.id);
      log('processEvent:ignored %O', {
        durationMs: Date.now() - startMs,
        eventId: event.id,
        eventType: event.type,
        outcome: 'ignored',
        reason: 'unhandled_event_type',
        webhookRowId: webhookRow.id,
      });
      return { outcome: 'ignored', reason: `unhandled event type: ${event.type}` };
    }

    // ── Steps 4-9: atomic business transaction ─────────────────────────────────
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
        log('processEvent:idempotent %O', {
          attemptCount: lockedEvent.attemptCount,
          durationMs: Date.now() - startMs,
          eventId: event.id,
          eventType: event.type,
          orderId,
          outcome: 'idempotent',
          priorStatus: lockedEvent.status,
          webhookRowId: webhookRow.id,
        });
        return { orderId, outcome: 'idempotent' };
      }

      // Mark processing + increment attempt.
      await tx
        .update(webhookEvents)
        .set({
          attemptCount: sql`${webhookEvents.attemptCount} + 1`,
          processingStartedAt: new Date(),
          status: 'pending',
        })
        .where(eq(webhookEvents.id, webhookRow.id));

      // Re-read attemptCount for logging (after increment).
      const attemptCount = (lockedEvent.attemptCount ?? 0) + 1;

      // 6. Extract orderId from Stripe metadata (server-set at checkout creation).
      const orderId = extractOrderId(event);
      if (!orderId) {
        await tx
          .update(webhookEvents)
          .set({ failureReason: 'missing_order_id_in_metadata', status: 'failed' })
          .where(eq(webhookEvents.id, webhookRow.id));
        console.error('[stripe-webhook] ALERT: missing_order_id_in_metadata', {
          attemptCount,
          durationMs: Date.now() - startMs,
          eventId: event.id,
          eventType: event.type,
          outcome: 'rejected',
          reason: 'missing_order_id_in_metadata',
          webhookRowId: webhookRow.id,
        });
        return { alert: true, outcome: 'failed', reason: 'missing_order_id_in_metadata' };
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
          .set({ failureReason: 'order_not_found', status: 'failed' })
          .where(eq(webhookEvents.id, webhookRow.id));
        console.error('[stripe-webhook] ALERT: order_not_found', {
          attemptCount,
          durationMs: Date.now() - startMs,
          eventId: event.id,
          eventType: event.type,
          orderId,
          outcome: 'rejected',
          reason: 'order_not_found',
          webhookRowId: webhookRow.id,
        });
        return { alert: true, outcome: 'failed', reason: 'order_not_found' };
      }

      // Validate amount and currency (never trust the Stripe payload amounts).
      if (isSuccess) {
        const stripeAmount = extractAmount(event);
        const stripeCurrency = extractCurrency(event);

        if (stripeAmount !== null && stripeAmount !== Number(order.amountMinor)) {
          const reason = `amount_mismatch`;
          await tx
            .update(webhookEvents)
            .set({ failureReason: `amount_mismatch: expected=${order.amountMinor} got=${stripeAmount}`, status: 'failed' })
            .where(eq(webhookEvents.id, webhookRow.id));
          // Log amounts for reconciliation; NOT card or customer data.
          console.error('[stripe-webhook] ALERT: amount_mismatch', {
            attemptCount,
            durationMs: Date.now() - startMs,
            eventId: event.id,
            eventType: event.type,
            expectedAmountMinor: order.amountMinor.toString(),
            orderId,
            outcome: 'rejected',
            reason,
            receivedAmountMinor: stripeAmount,
            webhookRowId: webhookRow.id,
          });
          return { alert: true, outcome: 'failed', reason };
        }

        if (stripeCurrency && stripeCurrency.toUpperCase() !== order.currency.toUpperCase()) {
          const reason = `currency_mismatch`;
          await tx
            .update(webhookEvents)
            .set({ failureReason: `currency_mismatch: expected=${order.currency} got=${stripeCurrency}`, status: 'failed' })
            .where(eq(webhookEvents.id, webhookRow.id));
          console.error('[stripe-webhook] ALERT: currency_mismatch', {
            attemptCount,
            durationMs: Date.now() - startMs,
            eventId: event.id,
            eventType: event.type,
            expectedCurrency: order.currency,
            orderId,
            outcome: 'rejected',
            reason,
            receivedCurrency: stripeCurrency,
            webhookRowId: webhookRow.id,
          });
          return { alert: true, outcome: 'failed', reason };
        }
      }

      // 8. State machine enforcement.
      if (order.status === 'paid') {
        if (!isSuccess) {
          // Late failure/close on already-paid order — log but ignore safely.
          console.warn('[stripe-webhook] late_failure_on_paid_order', {
            attemptCount,
            durationMs: Date.now() - startMs,
            eventId: event.id,
            eventType: event.type,
            orderId,
            outcome: 'idempotent',
            reason: 'order_already_paid',
            webhookRowId: webhookRow.id,
          });
        }
        await tx
          .update(webhookEvents)
          .set({ orderId, processedAt: new Date(), status: 'ignored' })
          .where(eq(webhookEvents.id, webhookRow.id));
        return { orderId, outcome: 'idempotent' };
      }

      if (order.status !== 'pending') {
        if (isSuccess) {
          const reason = `order_in_${order.status}_state`;
          await tx
            .update(webhookEvents)
            .set({ failureReason: `unexpected_success_for_${order.status}_order`, status: 'failed' })
            .where(eq(webhookEvents.id, webhookRow.id));
          console.error('[stripe-webhook] ALERT: unexpected_success_for_non_pending_order', {
            attemptCount,
            durationMs: Date.now() - startMs,
            eventId: event.id,
            eventType: event.type,
            orderId,
            orderStatus: order.status,
            outcome: 'rejected',
            reason,
            webhookRowId: webhookRow.id,
          });
          return { alert: true, outcome: 'failed', reason };
        }
        await tx
          .update(webhookEvents)
          .set({ orderId, processedAt: new Date(), status: 'ignored' })
          .where(eq(webhookEvents.id, webhookRow.id));
        return { orderId, outcome: 'idempotent' };
      }

      // 9. Execute transition + ledger inside the same transaction.
      if (isSuccess) {
        await tx
          .update(orders)
          .set({ paidAt: new Date(), status: 'paid' })
          .where(and(eq(orders.id, orderId), eq(orders.status, 'pending')));

        const [billingAcc] = await tx
          .select()
          .from(billingAccounts)
          .where(eq(billingAccounts.id, order.billingAccountId))
          .limit(1);

        if (!billingAcc) throw new TRPCError({ code: 'NOT_FOUND', message: 'billing account not found' });

        const priceSnap = order.priceSnapshot as { creditGrant?: string };
        const creditGrant = priceSnap?.creditGrant ? BigInt(priceSnap.creditGrant) : BigInt(0);

        let ledgerEntryId = '';
        if (creditGrant > 0n) {
          const billingService = new BillingCommandService(tx as unknown as LobeChatDatabase);
          const creditResult = await billingService.credit({
            billingAccountId: billingAcc.id,
            credits: creditGrant,
            idempotencyKey: `payment:stripe:${event.id}:credit`,
            orderId: order.id,
            reason: `order paid: ${order.orderNo}`,
          });
          ledgerEntryId = creditResult.ledgerEntryId;
        }

        await tx
          .update(webhookEvents)
          .set({ orderId, processedAt: new Date(), status: 'processed' })
          .where(eq(webhookEvents.id, webhookRow.id));

        console.info('[stripe-webhook] processed', {
          attemptCount,
          creditGrant: creditGrant.toString(),
          durationMs: Date.now() - startMs,
          eventId: event.id,
          eventType: event.type,
          ledgerEntryId: ledgerEntryId || null,
          orderId,
          outcome: 'processed',
          webhookRowId: webhookRow.id,
        });

        return { ledgerEntryId, orderId, outcome: 'processed' };
      }

      // Failure event — close or fail the order.
      const nextStatus = event.type === 'checkout.session.expired' ? 'closed' : 'failed';
      await tx
        .update(orders)
        .set({ closedAt: nextStatus === 'closed' ? new Date() : undefined, status: nextStatus })
        .where(and(eq(orders.id, orderId), eq(orders.status, 'pending')));

      await tx
        .update(webhookEvents)
        .set({ orderId, processedAt: new Date(), status: 'processed' })
        .where(eq(webhookEvents.id, webhookRow.id));

      console.info('[stripe-webhook] processed_failure_event', {
        attemptCount,
        durationMs: Date.now() - startMs,
        eventId: event.id,
        eventType: event.type,
        orderId,
        orderNextStatus: nextStatus,
        outcome: 'processed',
        webhookRowId: webhookRow.id,
      });

      return { ledgerEntryId: '', orderId, outcome: 'processed' };
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sha256(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Removes PII / secrets from the event before persisting.
 * Retained fields: id, type, created, livemode, object_id, object_status,
 * amount_total, currency, metadata_order_id.
 * NEVER persists: customer email, card data, billing address, raw metadata.
 */
function scrubPayload(event: Stripe.Event): Record<string, unknown> {
  return {
    amount_total: (event.data.object as any)?.amount_total,
    created: event.created,
    currency: (event.data.object as any)?.currency,
    id: event.id,
    livemode: event.livemode,
    metadata_order_id: (event.data.object as any)?.metadata?.orderId,
    object_id: (event.data.object as any)?.id,
    object_status: (event.data.object as any)?.status,
    type: event.type,
  };
}

function extractOrderId(event: Stripe.Event): string | null {
  const obj = event.data.object as any;
  return obj?.metadata?.orderId ?? obj?.metadata?.order_id ?? null;
}

function extractAmount(event: Stripe.Event): number | null {
  const obj = event.data.object as any;
  return obj?.amount_total ?? obj?.amount_received ?? null;
}

function extractCurrency(event: Stripe.Event): string | null {
  const obj = event.data.object as any;
  return obj?.currency ?? null;
}
