/**
 * admin.orders — order list/inspect, payment attempt history, webhook events.
 * Read-only. State transitions are only allowed via webhook.
 */
import { TRPCError } from '@trpc/server';
import { and, desc, eq, or } from 'drizzle-orm';
import { z } from 'zod';

import { router } from '@/libs/trpc/lambda';
import { orders, paymentAttempts, webhookEvents } from '@/database/schemas';

import { adminProcedure } from '../middleware';

export const adminOrdersRouter = router({
  list: adminProcedure
    .input(
      z.object({
        cursor: z.number().default(0),
        limit: z.number().min(1).max(100).default(20),
        status: z.string().optional(),
        userId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { serverDB } = ctx;
      const conditions = [];
      if (input.status) conditions.push(eq(orders.status, input.status as any));
      if (input.userId) conditions.push(eq(orders.userId, input.userId));

      const rows = await serverDB
        .select({
          id: orders.id,
          orderNo: orders.orderNo,
          userId: orders.userId,
          status: orders.status,
          currency: orders.currency,
          amountMinor: orders.amountMinor,
          paidAt: orders.paidAt,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(orders.createdAt))
        .limit(input.limit + 1)
        .offset(input.cursor);

      const hasMore = rows.length > input.limit;
      return { items: rows.slice(0, input.limit), nextCursor: hasMore ? input.cursor + input.limit : null };
    }),

  /** Inspect a single order with its payment attempts and related webhook events. */
  get: adminProcedure
    .input(z.object({ orderId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { serverDB } = ctx;
      const [order] = await serverDB.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
      if (!order) throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });

      const attempts = await serverDB
        .select()
        .from(paymentAttempts)
        .where(eq(paymentAttempts.orderId, input.orderId))
        .orderBy(desc(paymentAttempts.createdAt));

      const events = await serverDB
        .select({
          id: webhookEvents.id,
          provider: webhookEvents.provider,
          eventId: webhookEvents.eventId,
          eventType: webhookEvents.eventType,
          status: webhookEvents.status,
          attemptCount: webhookEvents.attemptCount,
          processedAt: webhookEvents.processedAt,
          failureReason: webhookEvents.failureReason,
          createdAt: webhookEvents.createdAt,
          // payload is scrubbed at insert time; safe to return
          payload: webhookEvents.payload,
        })
        .from(webhookEvents)
        .where(eq(webhookEvents.orderId, input.orderId))
        .orderBy(desc(webhookEvents.createdAt));

      return { order, attempts, events };
    }),
});
