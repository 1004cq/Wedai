/**
 * spendRouter — user-facing balance, usage, and ledger queries.
 */
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { authedProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { billingAccounts, ledgerEntries, usageRecords, wallets } from '@/database/schemas';

const spendProcedure = authedProcedure.use(serverDatabase);

export const spendRouter = router({
  /** Current wallet balances for the calling user. */
  balance: spendProcedure.query(async ({ ctx }) => {
    const { serverDB, userId } = ctx;

    const [account] = await serverDB
      .select()
      .from(billingAccounts)
      .where(eq(billingAccounts.userId, userId))
      .limit(1);

    if (!account) return { available: '0', reserved: '0' };

    const [wallet] = await serverDB
      .select({ available: wallets.available, reserved: wallets.reserved })
      .from(wallets)
      .where(eq(wallets.billingAccountId, account.id))
      .limit(1);

    return {
      available: (wallet?.available ?? 0n).toString(),
      reserved: (wallet?.reserved ?? 0n).toString(),
    };
  }),

  /** Paginated ledger history (credits, debits, grants). */
  ledgerHistory: spendProcedure
    .input(
      z.object({
        cursor: z.number().default(0),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { serverDB, userId } = ctx;

      const [account] = await serverDB
        .select()
        .from(billingAccounts)
        .where(eq(billingAccounts.userId, userId))
        .limit(1);

      if (!account) return { items: [], nextCursor: null };

      const rows = await serverDB
        .select({
          id: ledgerEntries.id,
          kind: ledgerEntries.kind,
          delta: ledgerEntries.delta,
          balanceAfter: ledgerEntries.balanceAfter,
          reason: ledgerEntries.reason,
          orderId: ledgerEntries.orderId,
          createdAt: ledgerEntries.createdAt,
        })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.billingAccountId, account.id))
        .orderBy(desc(ledgerEntries.createdAt))
        .limit(input.limit + 1)
        .offset(input.cursor);

      const hasMore = rows.length > input.limit;
      // Serialise bigints as strings for JSON transport
      const items = rows.slice(0, input.limit).map((r) => ({
        ...r,
        delta: r.delta.toString(),
        balanceAfter: r.balanceAfter.toString(),
      }));

      return { items, nextCursor: hasMore ? input.cursor + input.limit : null };
    }),

  /** Paginated usage records. */
  usageHistory: spendProcedure
    .input(
      z.object({
        cursor: z.number().default(0),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { serverDB, userId } = ctx;

      const [account] = await serverDB
        .select()
        .from(billingAccounts)
        .where(eq(billingAccounts.userId, userId))
        .limit(1);

      if (!account) return { items: [], nextCursor: null };

      const rows = await serverDB
        .select({
          id: usageRecords.id,
          requestId: usageRecords.requestId,
          modelId: usageRecords.modelId,
          provider: usageRecords.provider,
          promptTokens: usageRecords.promptTokens,
          completionTokens: usageRecords.completionTokens,
          totalTokens: usageRecords.totalTokens,
          creditsCharged: usageRecords.creditsCharged,
          settlementStatus: usageRecords.settlementStatus,
          createdAt: usageRecords.createdAt,
        })
        .from(usageRecords)
        .where(
          and(
            eq(usageRecords.billingAccountId, account.id),
            eq(usageRecords.userId, userId),
          ),
        )
        .orderBy(desc(usageRecords.createdAt))
        .limit(input.limit + 1)
        .offset(input.cursor);

      const hasMore = rows.length > input.limit;
      const items = rows.slice(0, input.limit).map((r) => ({
        ...r,
        creditsCharged: r.creditsCharged.toString(),
      }));

      return { items, nextCursor: hasMore ? input.cursor + input.limit : null };
    }),
});
