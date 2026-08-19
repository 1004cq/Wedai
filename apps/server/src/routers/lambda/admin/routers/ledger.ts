/**
 * admin.ledger — read-only view of append-only ledger entries.
 * Rows are NEVER modified here. Manual adjustments go via admin.adjustments.
 */
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { router } from '@/libs/trpc/lambda';
import { ledgerEntries } from '@/database/schemas';

import { adminProcedure } from '../middleware';

export const adminLedgerRouter = router({
  list: adminProcedure
    .input(
      z.object({
        billingAccountId: z.string().min(1),
        cursor: z.number().default(0),
        limit: z.number().min(1).max(200).default(50),
        kind: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { serverDB } = ctx;
      const conditions = [eq(ledgerEntries.billingAccountId, input.billingAccountId)];
      if (input.kind) conditions.push(eq(ledgerEntries.kind, input.kind as any));

      const rows = await serverDB
        .select()
        .from(ledgerEntries)
        .where(and(...conditions))
        .orderBy(desc(ledgerEntries.createdAt))
        .limit(input.limit + 1)
        .offset(input.cursor);

      const hasMore = rows.length > input.limit;
      return { items: rows.slice(0, input.limit), nextCursor: hasMore ? input.cursor + input.limit : null };
    }),
});
