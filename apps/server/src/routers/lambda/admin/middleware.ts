/**
 * Wedai commercial admin middleware — default-deny.
 *
 * SECURITY CONTRACT (ACCEPTANCE §7, §8):
 *  - Uses server-side DB role check ONLY. Never trusts query params, body
 *    fields, or client-supplied tokens to grant admin access.
 *  - role = 'admin' is set via Better Auth's admin plugin on the `users` table.
 *  - Deliberately separate from the OSS workspace RBAC stub (which is a no-op).
 *  - Every procedure using `adminProcedure` is automatically protected.
 */
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';

import { users } from '@/database/schemas';
import { authedProcedure } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';

/**
 * Base admin procedure.
 * Chain: authedProcedure → serverDatabase → adminGuard
 *
 * Usage:
 *   export const adminRouter = router({
 *     listUsers: adminProcedure.query(async ({ ctx }) => { ... })
 *   });
 */
export const adminProcedure = authedProcedure
  .use(serverDatabase)
  .use(async (opts) => {
    const { ctx } = opts;

    // Re-read role from DB on every request — never from JWT/session cache.
    const [user] = await ctx.serverDB
      .select({ role: users.role, banned: users.banned })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1);

    if (!user || user.role !== 'admin' || user.banned) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Admin access required',
      });
    }

    return opts.next({ ctx });
  });
