/**
 * topUpRouter — Wedai commercial top-up and order management procedures.
 *
 * Security:
 *  - Clients only supply `planPriceId`; the server re-reads and freezes the
 *    price. Client-supplied amounts are ignored.
 *  - successUrl / cancelUrl are constructed server-side from APP_URL.
 *  - The TRPC procedure requires an authenticated session (authedProcedure).
 */
import crypto from 'node:crypto';

import { PriceSnapshotService } from '@lobechat/billing';
import { BillingAccountModel, OrderModel } from '@lobechat/database';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { checkFixedWindowRateLimit } from '@/libs/rateLimit';
import { authedProcedure, router } from '@/libs/trpc/lambda';
import { bannedCheck, serverDatabase } from '@/libs/trpc/lambda/middleware';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a human-readable order number, e.g. "ORD-20240801-A3F2".
 * Unique enough for display; the DB `id` is the authoritative primary key.
 */
function generateOrderNo(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ORD-${date}-${suffix}`;
}

const ORDER_CREATE_RL_WINDOW_SECONDS = Number.parseInt(
  process.env.RATE_LIMIT_ORDER_CREATE_WINDOW_SECONDS ?? '60',
  10,
);
const ORDER_CREATE_RL_PER_MINUTE = Number.parseInt(
  process.env.RATE_LIMIT_ORDER_CREATE_PER_MINUTE ?? '5',
  10,
);

/**
 * Returns the billing account for the current user, creating one if it does
 * not exist yet (lazy creation on first purchase).
 */
async function getOrCreateBillingAccount(db: any, userId: string) {
  const bam = new BillingAccountModel(db, userId);
  const existing = await bam.findByUserId();
  if (existing) return existing;
  return bam.createForUser({ currency: 'CNY' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

const topUpProcedure = authedProcedure.use(serverDatabase).use(bannedCheck);

export const topUpRouter = router({
  /**
   * createOrder — creates an internal order and a Stripe Checkout Session.
   *
   * Input:  { planPriceId: string }
   * Output: { orderId, orderNo, checkoutUrl }
   *
   * The `planPriceId` is the only client-controlled input.  The server looks
   * up the price, recomputes the amount, and stores an immutable price snapshot
   * in the order row.  The client is redirected to `checkoutUrl`.
   */
  createOrder: topUpProcedure
    .input(
      z.object({
        planPriceId: z.string().min(1),
        /**
         * Client-supplied idempotency key (UUID or similar) to make the
         * entire checkout initiation idempotent.  If the user double-clicks
         * "Buy" we return the existing pending order.
         */
        clientIdempotencyKey: z.string().max(128).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { userId, serverDB: db } = ctx;

      // ============  B3: rate limit order creation  ============ //
      const decision = await checkFixedWindowRateLimit({
        namespace: 'order:create',
        identifier: userId,
        limit: ORDER_CREATE_RL_PER_MINUTE,
        windowSeconds: ORDER_CREATE_RL_WINDOW_SECONDS,
      });

      if (!decision.allowed) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many requests. Please try again later.',
          cause: { retryAfterSeconds: decision.retryAfterSeconds },
        });
      }

      // 1. Freeze price snapshot server-side.
      const pss = new PriceSnapshotService(db);
      const snapshot = await pss.freezeSnapshot(input.planPriceId);

      // 2. Get or lazily create billing account.
      const billingAccount = await getOrCreateBillingAccount(db, userId);

      // 3. Idempotency: if client supplied a key, look for an existing order.
      const ikey = input.clientIdempotencyKey ?? crypto.randomUUID();
      const om = new OrderModel(db, userId);

      const existing = await om.findByIdempotencyKey(ikey);
      if (existing && existing.status === 'pending') {
        // Re-create a Stripe session if the original session expired.
        const { StripePaymentService } =
          await import('@/server/services/payment/StripePaymentService');
        const appUrl = process.env.APP_URL ?? 'http://localhost:3010';
        const { url } = await StripePaymentService.createCheckoutSession({
          orderId: existing.id,
          orderNo: existing.orderNo,
          priceSnapshot: snapshot,
          successUrl: `${appUrl}/settings/plans?orderId=${existing.id}&fromCheckout=1`,
          cancelUrl: `${appUrl}/settings/plans?orderId=${existing.id}&cancelled=1`,
        });
        return { orderId: existing.id, orderNo: existing.orderNo, checkoutUrl: url };
      }

      // 4. Create internal order (status = pending).
      const orderNo = generateOrderNo();
      const priceSnapshotJson = {
        planId: snapshot.planId,
        planPriceId: snapshot.planPriceId,
        amountMinor: snapshot.amountMinor.toString(),
        currency: snapshot.currency,
        billingInterval: snapshot.billingInterval,
        // creditGrant is used by the webhook to know how many credits to add.
        creditGrant: snapshot.creditGrant?.toString() ?? '0',
      };

      const order = await om.create({
        billingAccountId: billingAccount.id,
        planPriceId: input.planPriceId,
        currency: snapshot.currency,
        amountMinor: snapshot.amountMinor,
        priceSnapshot: priceSnapshotJson,
        orderNo,
        idempotencyKey: ikey,
      });

      // 5. Create Stripe Checkout Session.
      const { StripePaymentService } =
        await import('@/server/services/payment/StripePaymentService');
      const appUrl = process.env.APP_URL ?? 'http://localhost:3010';

      const { url } = await StripePaymentService.createCheckoutSession({
        orderId: order.id,
        orderNo,
        priceSnapshot: snapshot,
        successUrl: `${appUrl}/settings/plans?orderId=${order.id}&fromCheckout=1`,
        cancelUrl: `${appUrl}/settings/plans?orderId=${order.id}&cancelled=1`,
      });

      return { orderId: order.id, orderNo, checkoutUrl: url };
    }),

  /**
   * getOrder — returns the current status of an order owned by the caller.
   *
   * Used by the success-URL page (/payment/result) to poll status.
   * The page MUST NOT interpret "paid" from a URL param — only from this
   * server-returned value.
   */
  getOrder: topUpProcedure
    .input(z.object({ orderId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { userId, serverDB: db } = ctx;
      const om = new OrderModel(db, userId);
      const order = await om.findById(input.orderId);
      if (!order) throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      // Return only safe fields — no price snapshot PII, no billing account ID.
      return {
        orderId: order.id,
        orderNo: order.orderNo,
        status: order.status,
        currency: order.currency,
        amountMinor: order.amountMinor.toString(),
        paidAt: order.paidAt,
        createdAt: order.createdAt,
      };
    }),

  /**
   * cancelOrder — user-initiated cancellation of a pending order.
   *
   * Transitions pending → closed.  Idempotent: already-closed/paid orders
   * are returned without error.
   */
  cancelOrder: topUpProcedure
    .input(z.object({ orderId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { userId, serverDB: db } = ctx;
      const om = new OrderModel(db, userId);
      const order = await om.findById(input.orderId);
      if (!order) throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      if (order.status !== 'pending') {
        // Idempotent — return current status without side-effects.
        return { orderId: order.id, status: order.status };
      }
      const updated = await om.transition(order.id, 'closed');
      return { orderId: updated.id, status: updated.status };
    }),
});
