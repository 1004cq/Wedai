/**
 * admin.webhooks — read-only webhook event stats and recent event list.
 *
 * Useful for:
 *  - Monitoring outcome distribution (processed/failed/ignored/pending)
 *  - Identifying events stuck in 'pending' (long-running processing or 500 loops)
 *  - Looking up specific events by provider event ID
 */
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';

import { router } from '@/libs/trpc/lambda';
import { webhookEvents } from '@/database/schemas';

import { adminProcedure } from '../middleware';

export const adminWebhooksRouter = router({
  /**
   * Recent webhook events, newest first.
   * Supports status filter and provider filter.
   */
  list: adminProcedure
    .input(
      z.object({
        cursor: z.number().default(0),
        limit: z.number().min(1).max(200).default(50),
        provider: z.string().optional(),
        status: z
          .enum(['pending', 'processed', 'failed', 'ignored'])
          .optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { serverDB } = ctx;
      const conditions = [];
      if (input.provider) conditions.push(eq(webhookEvents.provider, input.provider));
      if (input.status) conditions.push(eq(webhookEvents.status, input.status));

      const rows = await serverDB
        .select({
          attemptCount: webhookEvents.attemptCount,
          createdAt: webhookEvents.createdAt,
          eventId: webhookEvents.eventId,
          eventType: webhookEvents.eventType,
          failureReason: webhookEvents.failureReason,
          id: webhookEvents.id,
          orderId: webhookEvents.orderId,
          processedAt: webhookEvents.processedAt,
          processingStartedAt: webhookEvents.processingStartedAt,
          provider: webhookEvents.provider,
          status: webhookEvents.status,
          updatedAt: webhookEvents.updatedAt,
        })
        .from(webhookEvents)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(webhookEvents.createdAt))
        .limit(input.limit + 1)
        .offset(input.cursor);

      const hasMore = rows.length > input.limit;
      return {
        items: rows.slice(0, input.limit),
        nextCursor: hasMore ? input.cursor + input.limit : null,
      };
    }),

  /**
   * Look up a single event by provider + eventId (Stripe evt_xxx).
   */
  getByEventId: adminProcedure
    .input(
      z.object({
        eventId: z.string().min(1),
        provider: z.string().default('stripe'),
      }),
    )
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.serverDB
        .select()
        .from(webhookEvents)
        .where(
          and(
            eq(webhookEvents.provider, input.provider),
            eq(webhookEvents.eventId, input.eventId),
          ),
        )
        .limit(1);
      return row ?? null;
    }),

  /**
   * Status distribution for the last N hours.
   * Useful for dashboard / alerting: "how many failed in the last hour?"
   */
  stats: adminProcedure
    .input(
      z.object({
        /** Number of hours to look back. Default: 24. */
        lookbackHours: z.number().min(1).max(720).default(24),
        provider: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { serverDB } = ctx;
      const since = new Date(Date.now() - input.lookbackHours * 60 * 60 * 1000);

      const conditions = [gte(webhookEvents.createdAt, since)];
      if (input.provider) conditions.push(eq(webhookEvents.provider, input.provider));

      const rows = await serverDB
        .select({
          count: sql<number>`count(*)::int`,
          status: webhookEvents.status,
        })
        .from(webhookEvents)
        .where(and(...conditions))
        .groupBy(webhookEvents.status);

      // Shape into a flat record for easy consumption.
      const distribution: Record<string, number> = {
        failed: 0,
        ignored: 0,
        pending: 0,
        processed: 0,
      };
      for (const row of rows) {
        if (row.status) distribution[row.status] = row.count;
      }

      return {
        distribution,
        lookbackHours: input.lookbackHours,
        since: since.toISOString(),
        total: Object.values(distribution).reduce((a, b) => a + b, 0),
      };
    }),

  /**
   * Events stuck in 'pending' for longer than `stuckThresholdMinutes`.
   * A non-zero count means a processing run started but never committed.
   * Typically caused by a server crash during transaction, or repeated 500s.
   */
  stuckEvents: adminProcedure
    .input(
      z.object({
        /** Minutes after processingStartedAt before an event is considered stuck. */
        stuckThresholdMinutes: z.number().min(1).default(5),
      }),
    )
    .query(async ({ ctx, input }) => {
      const threshold = new Date(
        Date.now() - input.stuckThresholdMinutes * 60 * 1000,
      );

      const rows = await ctx.serverDB
        .select({
          attemptCount: webhookEvents.attemptCount,
          createdAt: webhookEvents.createdAt,
          eventId: webhookEvents.eventId,
          eventType: webhookEvents.eventType,
          id: webhookEvents.id,
          orderId: webhookEvents.orderId,
          processingStartedAt: webhookEvents.processingStartedAt,
          provider: webhookEvents.provider,
        })
        .from(webhookEvents)
        .where(
          and(
            eq(webhookEvents.status, 'pending'),
            // processingStartedAt is not null AND older than threshold
            sql`${webhookEvents.processingStartedAt} IS NOT NULL AND ${webhookEvents.processingStartedAt} < ${threshold.toISOString()}`,
          ),
        )
        .orderBy(desc(webhookEvents.attemptCount))
        .limit(50);

      return {
        stuckCount: rows.length,
        stuckThresholdMinutes: input.stuckThresholdMinutes,
        items: rows,
      };
    }),
});
