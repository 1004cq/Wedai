/**
 * Wedai commercial plans catalog (CNY, amounts in fen / 分).
 *
 * Credit grants reuse `plans.token_grant_monthly` for both monthly and one-time
 * packs — PriceSnapshotService.freezeSnapshot copies that field into order
 * creditGrant. Stripe Checkout remains mode=payment (one-shot); recurring
 * Stripe subscriptions are not wired yet.
 *
 * | slug           | interval  | amountMinor | creditGrant |
 * |----------------|-----------|-------------|-------------|
 * | free           | monthly   | 0           | 100_000     |
 * | pack_basic     | one_time  | 990 (¥9.9)  | 9_999       |
 * | pack_standard  | one_time  | 2900 (¥29)  | 29_000      |
 * | plus_monthly   | monthly   | 5000 (¥50)  | 50_000      |
 * | pro_monthly    | monthly   | 9900 (¥99)  | 99_000      |
 */
export type PlanCatalogInterval = 'one_time' | 'monthly';

export interface PlanCatalogEntry {
  amountMinor: bigint;
  billingInterval: PlanCatalogInterval;
  description: string;
  features: Record<string, boolean | number | string>;
  name: string;
  slug: string;
  sortOrder: number;
  /** Stored in plans.token_grant_monthly; credited on successful topUp. */
  tokenGrantMonthly: bigint;
}

export const WEDAI_PLAN_CATALOG: PlanCatalogEntry[] = [
  {
    amountMinor: BigInt(0),
    billingInterval: 'monthly',
    description:
      '免费版：每月赠送 100,000 积分（写入 token_grant_monthly，用于体验）。价格 ¥0，无需付款。',
    features: { maxModels: 3, prioritySupport: false, tier: 'free' },
    name: '免费版',
    slug: 'free',
    sortOrder: 0,
    tokenGrantMonthly: BigInt(100_000),
  },
  {
    amountMinor: BigInt(990),
    billingInterval: 'one_time',
    description: '基础积分包：一次性支付 ¥9.9，到账 9,999 积分。非订阅，付款后立即入账。',
    features: { pack: true, tier: 'pack_basic' },
    name: '基础积分包',
    slug: 'pack_basic',
    sortOrder: 1,
    tokenGrantMonthly: BigInt(9_999),
  },
  {
    amountMinor: BigInt(2900),
    billingInterval: 'one_time',
    description: '标准积分包：一次性支付 ¥29，到账 29,000 积分。非订阅，付款后立即入账。',
    features: { pack: true, tier: 'pack_standard' },
    name: '标准积分包',
    slug: 'pack_standard',
    sortOrder: 2,
    tokenGrantMonthly: BigInt(29_000),
  },
  {
    amountMinor: BigInt(5000),
    billingInterval: 'monthly',
    description:
      'Plus 月付：¥50 / 月，到账 50,000 积分。当前结账为一次性支付到账（现有 topUp）；Stripe 自动续费尚未开通。',
    features: { prioritySupport: false, tier: 'plus' },
    name: 'Plus 月付',
    slug: 'plus_monthly',
    sortOrder: 3,
    tokenGrantMonthly: BigInt(50_000),
  },
  {
    amountMinor: BigInt(9900),
    billingInterval: 'monthly',
    description:
      'Pro 月付：¥99 / 月，到账 99,000 积分。当前结账为一次性支付到账（现有 topUp）；Stripe 自动续费尚未开通。',
    features: { prioritySupport: true, tier: 'pro' },
    name: 'Pro 月付',
    slug: 'pro_monthly',
    sortOrder: 4,
    tokenGrantMonthly: BigInt(99_000),
  },
];
