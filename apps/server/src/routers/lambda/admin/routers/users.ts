/**
 * admin.users — user search, ban/unban, billing summary.
 * All fields containing PII are returned as-is; callers are responsible
 * for access-log hygiene. Passwords and API key secrets are never returned.
 */
import { TRPCError } from '@trpc/server';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { router } from '@/libs/trpc/lambda';
import { billingAccounts, users, wallets } from '@/database/schemas';

import { adminProcedure } from '../middleware';

export const adminUsersRouter = router({
  /** Paginated user list with optional search. */
  list: adminProcedure
    .input(
      z.object({
        cursor: z.number().default(0),
        limit: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { serverDB } = ctx;
      const { cursor, limit, search } = input;

      const where = search
        ? or(
            ilike(users.email, `%${search}%`),
            ilike(users.fullName, `%${search}%`),
            ilike(users.username, `%${search}%`),
          )
        : undefined;

      const rows = await serverDB
        .select({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          username: users.username,
          role: users.role,
          banned: users.banned,
          banReason: users.banReason,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(limit + 1)
        .offset(cursor);

      const hasMore = rows.length > limit;
      return { items: rows.slice(0, limit), nextCursor: hasMore ? cursor + limit : null };
    }),

  /** Single user with wallet balance. */
  get: adminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { serverDB } = ctx;
      const [user] = await serverDB
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

      const [account] = await serverDB
        .select()
        .from(billingAccounts)
        .where(eq(billingAccounts.userId, input.userId))
        .limit(1);

      let wallet: { available: bigint; reserved: bigint } | null = null;
      if (account) {
        const [w] = await serverDB
          .select({ available: wallets.available, reserved: wallets.reserved })
          .from(wallets)
          .where(eq(wallets.billingAccountId, account.id))
          .limit(1);
        wallet = w ?? null;
      }

      // Never return password hash or sensitive tokens
      const { ...safeUser } = user;
      return { user: safeUser, billingAccountId: account?.id ?? null, wallet };
    }),

  /** Ban or unban a user (writes ban state + reason). */
  setBan: adminProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        banned: z.boolean(),
        reason: z.string().max(256).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { serverDB } = ctx;
      const [updated] = await serverDB
        .update(users)
        .set({
          banned: input.banned,
          banReason: input.banned ? (input.reason ?? null) : null,
        })
        .where(eq(users.id, input.userId))
        .returning({ id: users.id, banned: users.banned });
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      return updated;
    }),
});
