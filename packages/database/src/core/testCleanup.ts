import { inArray } from 'drizzle-orm';

import { releaseProjectEnvironments } from '../models/utils/projectEnvironmentCleanup';
import {
  environmentInstances,
  environments,
  ledgerEntries,
  orders,
  projectEnvironments,
  usageRecords,
  users,
} from '../schemas';
import type { LobeChatDatabase } from '../type';

/**
 * Clear billing ownership rows before user teardown.
 * Schema now cascades `usage_records` / `orders` on user delete, but explicit
 * cleanup keeps shared-DB vitest files isolated and clears operator FKs early.
 */
const clearBillingRestrictors = async (db: LobeChatDatabase, ids?: string[]) => {
  if (ids) {
    await db.delete(ledgerEntries).where(inArray(ledgerEntries.operatorUserId, ids));
    await db.delete(usageRecords).where(inArray(usageRecords.userId, ids));
    await db.delete(orders).where(inArray(orders.userId, ids));
    return;
  }

  await db.delete(ledgerEntries);
  await db.delete(usageRecords);
  await db.delete(orders);
};

/**
 * Deletes test users the way account deletion does: every project has its own
 * environment, and `environments.user_id` is `restrict`, so the environments of
 * the users' projects are released first. Without ids, every user goes, and so
 * does every environment.
 */
export const deleteTestUsers = async (db: LobeChatDatabase, ids?: string[]) => {
  if (ids) {
    await clearBillingRestrictors(db, ids);
    for (const userId of ids) await releaseProjectEnvironments(db, { userId });
    await db.delete(users).where(inArray(users.id, ids));
    return;
  }

  // A test that deleted a project directly leaves its environment behind,
  // standalone, still holding its user: every environment goes.
  await clearBillingRestrictors(db);
  await db.delete(projectEnvironments);
  await db.delete(environmentInstances);
  await db.delete(environments);
  await db.delete(users);
};
