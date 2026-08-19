/**
 * subscriptionRouter — user-facing active plan & subscription queries.
 * Write operations (subscribe, cancel) are stubbed pending Stripe recurring setup.
 */
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';

import { authedProcedure, router } from '@/libs/trpc/lambda';
import { bannedCheck, serverDatabase } from '@/libs/trpc/lambda/middleware';
import {
  billingAccounts,
  plans,
  planPrices,
  subscriptions,
} from '@/database/schemas';

const subProcedure = authedProcedure.use(serverDatabase).use(bannedCheck);

export const subscriptionRouter = router({
  /** Returns the caller's active subscription, or null. */
  getActive: subProcedure.query(async ({ ctx }) => {
    const { serverDB, userId } = ctx;

    const [account] = await serverDB
      .select()
      .from(billingAccounts)
      .where(eq(billingAccounts.userId, userId))
      .limit(1);

    if (!account) return null;

    const [sub] = await serverDB
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.billingAccountId, account.id),
          eq(subscriptions.status, 'active'),
        ),
      )
      .limit(1);

    if (!sub) return null;

    const [plan] = await serverDB.select().from(plans).where(eq(plans.id, sub.planId)).limit(1);
    const [price] = await serverDB
      .select()
      .from(planPrices)
      .where(eq(planPrices.id, sub.planPriceId))
      .limit(1);

    return { subscription: sub, plan: plan ?? null, price: price ?? null };
  }),

  /** Lists all active, published plans (for the pricing page). */
  listPlans: subProcedure.query(async ({ ctx }) => {
    const { serverDB } = ctx;
    const activePlans = await serverDB
      .select()
      .from(plans)
      .where(eq(plans.status, 'active'))
      .orderBy(plans.sortOrder);

    const priceRows = await serverDB
      .select()
      .from(planPrices)
      .where(eq(planPrices.archivedAt, null as any));

    return activePlans.map((p) => ({
      ...p,
      prices: priceRows.filter((pr) => pr.planId === p.id),
    }));
  }),
});
