/**
 * bannedCheck — rejects requests from banned users with FORBIDDEN.
 *
 * Must be applied AFTER `serverDatabase` (needs ctx.serverDB).
 * OIDC path already checks banned via assertOIDCUserActive; this covers
 * the web session path (Better Auth sessions remain valid after admin ban).
 *
 * Usage:
 *   const protectedProcedure = authedProcedure.use(serverDatabase).use(bannedCheck);
 *
 * Applied on high-impact procedures: chat, topUp, spend, subscription.
 * Not applied on read-only session/profile endpoints to avoid extra DB reads.
 */
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';

import { users } from '@/database/schemas';

import { trpc } from '../init';

export const bannedCheck = trpc.middleware(async (opts) => {
  const { ctx } = opts;

  // ctx.serverDB is guaranteed by serverDatabase middleware (applied before this one).
  const [user] = await ctx.serverDB
    .select({ banned: users.banned })
    .from(users)
    .where(eq(users.id, ctx.userId))
    .limit(1);

  if (user?.banned) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Your account has been suspended. Please contact support.',
    });
  }

  return opts.next({ ctx });
});
