/**
 * Wedai business-server user hooks.
 *
 * Called from apps/server/src/services/user/index.ts (UserService.initUser).
 * All operations go through the standard billing domain (BillingCommandService)
 * to ensure immutable ledger entries and idempotent credit grants.
 *
 * ## BYOK behaviour
 *
 * When a user configures their own API key for a provider in
 * Settings → Model Provider, subsequent requests to that provider are classified
 * as BYOK by `resolveChargeMode()` in packages/billing.
 * BYOK requests bypass `chargeBeforeChat`/`chargeAfterChat` entirely — no
 * platform credits are deducted.  This is the correct intended behaviour.
 *
 * See docs/commercial/BYOK.md for the full decision tree.
 */
import type { ReferralStatusString } from '@lobechat/types';
import { Plans } from '@lobechat/types';
import type { LobeChatDatabase } from '@lobechat/database';
import { BillingAccountModel } from '@lobechat/database';
import { BillingCommandService } from '@lobechat/billing';

export interface OnUserActivityForBusinessParams {
  currentTime: Date;
  previousLastActiveAt: Date;
  userCreatedAt: Date;
  userId: string;
}

export async function getReferralStatus(
  _userId: string,
): Promise<ReferralStatusString | undefined> {
  return undefined;
}

export async function getSubscriptionPlan(_userId: string): Promise<Plans> {
  return Plans.Free;
}

/**
 * Bootstrap a newly created user's commercial account:
 *
 *  1. Create a BillingAccount + Wallet (one per user, idempotent via unique index).
 *  2. If SIGNUP_CREDIT_GRANT > 0, credit the wallet once with a deterministic
 *     idempotency key so multiple calls never double-grant.
 *
 * Called from UserService.initUser (Better Auth `user.create.after` hook).
 * Failures are swallowed by the caller so a billing error never blocks registration.
 */
export async function initNewUserForBusiness(
  userId: string,
  _createdAt: Date | null | undefined,
  db?: LobeChatDatabase,
): Promise<void> {
  if (!db) return; // no-op when db is not provided (e.g. OSS builds without billing)

  // 1. Lazily create billing account + wallet (ON CONFLICT DO NOTHING via unique index).
  const bam = new BillingAccountModel(db, userId);
  let account = await bam.findByUserId();
  if (!account) {
    account = await bam.createForUser({ currency: 'CNY' });
  }

  // 2. Welcome credit grant (configurable; 0 = disabled).
  const grantAmount = getSignupCreditGrant();
  if (grantAmount <= 0n) return;

  const billingService = new BillingCommandService(db);
  await billingService.credit({
    billingAccountId: account.id,
    credits: grantAmount,
    // Deterministic idempotency key — safe to replay; only one row ever written.
    idempotencyKey: `signup:welcome:${userId}`,
    orderId: `signup-grant-${userId}`,
    reason: 'welcome_grant',
  });
}

export async function onUserActivityForBusiness(
  _params: OnUserActivityForBusinessParams,
): Promise<void> {}

// ─── helpers ─────────────────────────────────────────────────────────────────

function getSignupCreditGrant(): bigint {
  const raw = process.env.SIGNUP_CREDIT_GRANT;
  if (!raw) return 0n;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? BigInt(n) : 0n;
}
