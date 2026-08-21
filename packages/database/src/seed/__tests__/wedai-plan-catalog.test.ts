import { describe, expect, it } from 'vitest';

import { WEDAI_PLAN_CATALOG } from '../wedai-plan-catalog';

describe('WEDAI_PLAN_CATALOG', () => {
  it('contains the five published slugs with fen amounts and credit grants', () => {
    const bySlug = Object.fromEntries(WEDAI_PLAN_CATALOG.map((p) => [p.slug, p]));

    expect(bySlug.free).toMatchObject({
      amountMinor: 0n,
      billingInterval: 'monthly',
      tokenGrantMonthly: 100_000n,
    });
    expect(bySlug.pack_basic).toMatchObject({
      amountMinor: 990n,
      billingInterval: 'one_time',
      tokenGrantMonthly: 9_999n,
    });
    expect(bySlug.pack_standard).toMatchObject({
      amountMinor: 2900n,
      billingInterval: 'one_time',
      tokenGrantMonthly: 29_000n,
    });
    expect(bySlug.plus_monthly).toMatchObject({
      amountMinor: 5000n,
      billingInterval: 'monthly',
      tokenGrantMonthly: 50_000n,
    });
    expect(bySlug.pro_monthly).toMatchObject({
      amountMinor: 9900n,
      billingInterval: 'monthly',
      tokenGrantMonthly: 99_000n,
    });
  });

  it('uses Chinese display names and documents grants in description', () => {
    for (const plan of WEDAI_PLAN_CATALOG) {
      expect(plan.name.length).toBeGreaterThan(0);
      expect(plan.description).toMatch(/积分/);
    }
  });
});
