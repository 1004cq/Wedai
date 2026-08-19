/**
 * admin.dashboard — lightweight operational summary for admin.
 *
 * D1 (Admin 仪表盘聚合): for Phase 1 we keep the aggregation simple and
 * deterministic:
 *  - newUsersToday: users.createdAt within today
 *  - paidOrdersToday: orders.status='paid' and paidAt within today
 *  - revenueTodayMinor: sum(orders.amountMinor) for paid orders within today
 *  - creditsConsumedToday: sum(usage_records.credits_charged) for settled usage within today
 *  - creditsGrantedToday: sum(ledger_entries.delta) for kind='grant' within today
 *  - totalUsers: count(users)
 *
 * NOTE: This is a snapshot endpoint — it is read-only and safe for admin
 * dashboards.
 */
import { and, eq, gte, lt, sql } from 'drizzle-orm';

import { router } from '@/libs/trpc/lambda';
import { adminProcedure } from '../middleware';
import { ledgerEntries, orders, usageRecords, users } from '@/database/schemas';

const toSafeNumber = (value: bigint | number | string | null | undefined): number => {
  if (value === null || value === undefined) return 0;

  const n =
    typeof value === 'bigint' ? Number(value) : typeof value === 'string' ? Number.parseInt(value, 10) : value;

  if (!Number.isFinite(n)) return 0;
  return n;
};

const getTodayRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
};

export const adminDashboardRouter = router({
  summary: adminProcedure.query(async ({ ctx }) => {
    const { serverDB } = ctx;
    const { start, end } = getTodayRange();

    const [newUsersRows, totalUsersRows, paidOrdersRows, revenueRows, creditsConsumedRows, creditsGrantedRows] =
      await Promise.all([
        serverDB
          .select({ newUsersToday: sql<number>`count(*)::int` })
          .from(users)
          .where(and(gte(users.createdAt, start), lt(users.createdAt, end)))
          .limit(1),
        serverDB
          .select({ totalUsers: sql<number>`count(*)::int` })
          .from(users)
          .limit(1),
        serverDB
          .select({ paidOrdersToday: sql<number>`count(*)::int` })
          .from(orders)
          .where(and(eq(orders.status, 'paid'), gte(orders.paidAt, start), lt(orders.paidAt, end)))
          .limit(1),
        serverDB
          .select({ revenueTodayMinor: sql<bigint>`coalesce(sum(${orders.amountMinor}), 0)` })
          .from(orders)
          .where(and(eq(orders.status, 'paid'), gte(orders.paidAt, start), lt(orders.paidAt, end)))
          .limit(1),
        serverDB
          .select({
            creditsConsumedToday: sql<bigint>`coalesce(sum(${usageRecords.creditsCharged}), 0)`,
          })
          .from(usageRecords)
          .where(
            and(
              eq(usageRecords.settlementStatus, 'settled'),
              gte(usageRecords.createdAt, start),
              lt(usageRecords.createdAt, end),
            ),
          )
          .limit(1),
        serverDB
          .select({ creditsGrantedToday: sql<bigint>`coalesce(sum(${ledgerEntries.delta}), 0)` })
          .from(ledgerEntries)
          .where(
            and(
              eq(ledgerEntries.kind, 'grant'),
              gte(ledgerEntries.createdAt, start),
              lt(ledgerEntries.createdAt, end),
            ),
          )
          .limit(1),
      ]);

    const newUsersToday = newUsersRows[0]?.newUsersToday ?? 0;
    const totalUsers = totalUsersRows[0]?.totalUsers ?? 0;
    const paidOrdersToday = paidOrdersRows[0]?.paidOrdersToday ?? 0;
    const revenueTodayMinor = revenueRows[0]?.revenueTodayMinor ?? 0n;
    const creditsConsumedToday = creditsConsumedRows[0]?.creditsConsumedToday ?? 0n;
    const creditsGrantedToday = creditsGrantedRows[0]?.creditsGrantedToday ?? 0n;

    return {
      // D1 (AdminDashboardMetrics)
      newUsersToday: toSafeNumber(newUsersToday),
      paidOrdersToday: toSafeNumber(paidOrdersToday),
      revenueTodayMinor: toSafeNumber(revenueTodayMinor),
      creditsConsumedToday: toSafeNumber(creditsConsumedToday),
      creditsGrantedToday: toSafeNumber(creditsGrantedToday),
      totalUsers: toSafeNumber(totalUsers),
    };
  }),
});

