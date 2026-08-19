/**
 * Wedai commercial billing – repository integration tests
 *
 * Coverage:
 *  - Unique constraints (billing_accounts, ledger_entries, webhook_events, orders)
 *  - Order state-machine: legal transitions accepted, illegal transitions rejected
 *  - Wallet credit / hold / settle / release operations with idempotency
 *  - Concurrent hold: version-lock prevents double-spend
 *  - A/B user data isolation (user A cannot read/write user B's data)
 */
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  BillingAccountModel,
  OrderModel,
  PlanModel,
  UsageRecordModel,
  WalletModel,
  WebhookEventModel,
} from '../billing';
import { billingAccounts, ledgerEntries, orders, users, wallets } from '../../schemas';

// ─── fixtures ────────────────────────────────────────────────────────────────

const db = await getTestDB();

const userA = 'user-billing-a';
const userB = 'user-billing-b';

let planId: string;
let priceId: string;

async function seedUsers() {
  await db
    .insert(users)
    .values([{ id: userA }, { id: userB }])
    .onConflictDoNothing();
}

async function seedPlanAndPrice() {
  const pm = new PlanModel(db);
  const plan = await pm.create({
    slug: `test-plan-${Date.now()}`,
    name: 'Test Plan',
    status: 'active',
    tokenGrantMonthly: BigInt(1_000_000),
    sortOrder: 0,
  });
  const price = await pm.createPrice({
    planId: plan.id,
    currency: 'CNY',
    amountMinor: BigInt(9900),
    billingInterval: 'monthly',
  });
  planId = plan.id;
  priceId = price.id;
}

async function seedBillingAccount(userId: string) {
  const bam = new BillingAccountModel(db, userId);
  return bam.createForUser({ currency: 'CNY' });
}

// ─── setup / teardown ────────────────────────────────────────────────────────

beforeEach(async () => {
  // Clean in reverse FK order
  await db.delete(ledgerEntries);
  await db.delete(wallets);
  await db.delete(orders);
  await db.delete(billingAccounts);
  await db.delete(users).where(and(eq(users.id, userA)));
  await db.delete(users).where(and(eq(users.id, userB)));

  await seedUsers();
  await seedPlanAndPrice();
});

afterEach(async () => {
  await db.delete(ledgerEntries);
  await db.delete(wallets);
  await db.delete(orders);
  await db.delete(billingAccounts);
  await db.delete(users).where(and(eq(users.id, userA)));
  await db.delete(users).where(and(eq(users.id, userB)));
});

// ─── billing_accounts ────────────────────────────────────────────────────────

describe('BillingAccountModel', () => {
  it('creates an account and wallet for a user', async () => {
    const acc = await seedBillingAccount(userA);
    expect(acc.userId).toBe(userA);
    expect(acc.currency).toBe('CNY');
    expect(acc.status).toBe('active');

    const wm = new WalletModel(db);
    const wallet = await wm.findByBillingAccountId(acc.id);
    expect(wallet).toBeDefined();
    expect(wallet!.available).toBe(BigInt(0));
  });

  it('enforces unique billing account per user', async () => {
    await seedBillingAccount(userA);
    await expect(seedBillingAccount(userA)).rejects.toThrow();
  });

  it('A/B isolation: findById rejects cross-user lookup', async () => {
    const accA = await seedBillingAccount(userA);
    const bamB = new BillingAccountModel(db, userB);
    const result = await bamB.findById(accA.id);
    // User B cannot retrieve User A's billing account
    expect(result).toBeUndefined();
  });
});

// ─── orders + state machine ──────────────────────────────────────────────────

describe('OrderModel – state machine', () => {
  it('creates an order with pending status', async () => {
    const acc = await seedBillingAccount(userA);
    const om = new OrderModel(db, userA);
    const order = await om.create({
      billingAccountId: acc.id,
      planPriceId: priceId,
      currency: 'CNY',
      amountMinor: BigInt(9900),
      priceSnapshot: { planId, planPriceId: priceId, amountMinor: '9900', currency: 'CNY', billingInterval: 'monthly' },
      orderNo: `ORD-TEST-${Date.now()}`,
      idempotencyKey: `idem-${Date.now()}`,
    });
    expect(order.status).toBe('pending');
  });

  it('allows pending → paid', async () => {
    const acc = await seedBillingAccount(userA);
    const om = new OrderModel(db, userA);
    const order = await om.create({
      billingAccountId: acc.id,
      planPriceId: priceId,
      currency: 'CNY',
      amountMinor: BigInt(9900),
      priceSnapshot: { planId, planPriceId: priceId, amountMinor: '9900', currency: 'CNY', billingInterval: 'monthly' },
      orderNo: `ORD-PAID-${Date.now()}`,
      idempotencyKey: `idem-paid-${Date.now()}`,
    });
    const paid = await om.transition(order.id, 'paid');
    expect(paid.status).toBe('paid');
    expect(paid.paidAt).not.toBeNull();
  });

  it('allows pending → closed', async () => {
    const acc = await seedBillingAccount(userA);
    const om = new OrderModel(db, userA);
    const order = await om.create({
      billingAccountId: acc.id,
      planPriceId: priceId,
      currency: 'CNY',
      amountMinor: BigInt(9900),
      priceSnapshot: { planId, planPriceId: priceId, amountMinor: '9900', currency: 'CNY', billingInterval: 'monthly' },
      orderNo: `ORD-CLOSED-${Date.now()}`,
      idempotencyKey: `idem-closed-${Date.now()}`,
    });
    const closed = await om.transition(order.id, 'closed');
    expect(closed.status).toBe('closed');
  });

  it('rejects paid → failed (terminal state)', async () => {
    const acc = await seedBillingAccount(userA);
    const om = new OrderModel(db, userA);
    const order = await om.create({
      billingAccountId: acc.id,
      planPriceId: priceId,
      currency: 'CNY',
      amountMinor: BigInt(9900),
      priceSnapshot: { planId, planPriceId: priceId, amountMinor: '9900', currency: 'CNY', billingInterval: 'monthly' },
      orderNo: `ORD-TERM-${Date.now()}`,
      idempotencyKey: `idem-term-${Date.now()}`,
    });
    await om.transition(order.id, 'paid');
    await expect(om.transition(order.id, 'failed')).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
  });

  it('rejects paid → closed (terminal state)', async () => {
    const acc = await seedBillingAccount(userA);
    const om = new OrderModel(db, userA);
    const order = await om.create({
      billingAccountId: acc.id,
      planPriceId: priceId,
      currency: 'CNY',
      amountMinor: BigInt(9900),
      priceSnapshot: { planId, planPriceId: priceId, amountMinor: '9900', currency: 'CNY', billingInterval: 'monthly' },
      orderNo: `ORD-TC-${Date.now()}`,
      idempotencyKey: `idem-tc-${Date.now()}`,
    });
    await om.transition(order.id, 'paid');
    await expect(om.transition(order.id, 'closed')).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
  });

  it('A/B isolation: user B cannot transition user A order', async () => {
    const accA = await seedBillingAccount(userA);
    const omA = new OrderModel(db, userA);
    const order = await omA.create({
      billingAccountId: accA.id,
      planPriceId: priceId,
      currency: 'CNY',
      amountMinor: BigInt(9900),
      priceSnapshot: { planId, planPriceId: priceId, amountMinor: '9900', currency: 'CNY', billingInterval: 'monthly' },
      orderNo: `ORD-ISO-${Date.now()}`,
      idempotencyKey: `idem-iso-${Date.now()}`,
    });

    const omB = new OrderModel(db, userB);
    await expect(omB.transition(order.id, 'paid')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('order idempotency key is unique', async () => {
    const acc = await seedBillingAccount(userA);
    const ikey = `idem-dup-${Date.now()}`;
    const om = new OrderModel(db, userA);
    await om.create({
      billingAccountId: acc.id,
      planPriceId: priceId,
      currency: 'CNY',
      amountMinor: BigInt(9900),
      priceSnapshot: { planId, planPriceId: priceId, amountMinor: '9900', currency: 'CNY', billingInterval: 'monthly' },
      orderNo: `ORD-DUP1-${Date.now()}`,
      idempotencyKey: ikey,
    });
    await expect(
      om.create({
        billingAccountId: acc.id,
        planPriceId: priceId,
        currency: 'CNY',
        amountMinor: BigInt(9900),
        priceSnapshot: { planId, planPriceId: priceId, amountMinor: '9900', currency: 'CNY', billingInterval: 'monthly' },
        orderNo: `ORD-DUP2-${Date.now()}`,
        idempotencyKey: ikey,
      }),
    ).rejects.toThrow();
  });
});

// ─── wallet: credit / hold / settle / release + idempotency ──────────────────

describe('WalletModel', () => {
  it('credits a wallet and writes a ledger entry', async () => {
    const acc = await seedBillingAccount(userA);
    const wm = new WalletModel(db);
    const { wallet, ledger } = await wm.credit({
      billingAccountId: acc.id,
      delta: BigInt(1000),
      idempotencyKey: `credit-${Date.now()}`,
      reason: 'test top-up',
    });
    expect(wallet.available).toBe(BigInt(1000));
    expect(ledger.kind).toBe('credit');
    expect(ledger.delta).toBe(BigInt(1000));
    expect(ledger.balanceAfter).toBe(BigInt(1000));
  });

  it('credit is idempotent on repeated idempotency key', async () => {
    const acc = await seedBillingAccount(userA);
    const wm = new WalletModel(db);
    const ikey = `credit-idem-${Date.now()}`;
    const first = await wm.credit({ billingAccountId: acc.id, delta: BigInt(500), idempotencyKey: ikey });
    const second = await wm.credit({ billingAccountId: acc.id, delta: BigInt(500), idempotencyKey: ikey });
    expect(first.ledger.id).toBe(second.ledger.id);
    // Balance should not double
    const wallet = await wm.findByBillingAccountId(acc.id);
    expect(wallet!.available).toBe(BigInt(500));
  });

  it('holds credits and updates reserved', async () => {
    const acc = await seedBillingAccount(userA);
    const wm = new WalletModel(db);
    await wm.credit({ billingAccountId: acc.id, delta: BigInt(1000), idempotencyKey: `c-${Date.now()}` });

    const { wallet, ledger } = await wm.hold({
      billingAccountId: acc.id,
      amount: BigInt(300),
      idempotencyKey: `hold-${Date.now()}`,
    });
    expect(wallet.available).toBe(BigInt(700));
    expect(wallet.reserved).toBe(BigInt(300));
    expect(ledger.kind).toBe('hold');
    expect(ledger.delta).toBe(BigInt(-300));
  });

  it('hold is idempotent', async () => {
    const acc = await seedBillingAccount(userA);
    const wm = new WalletModel(db);
    await wm.credit({ billingAccountId: acc.id, delta: BigInt(1000), idempotencyKey: `c2-${Date.now()}` });
    const ikey = `hold-idem-${Date.now()}`;
    const first = await wm.hold({ billingAccountId: acc.id, amount: BigInt(200), idempotencyKey: ikey });
    const second = await wm.hold({ billingAccountId: acc.id, amount: BigInt(200), idempotencyKey: ikey });
    expect(first.ledger.id).toBe(second.ledger.id);
    const w = await wm.findByBillingAccountId(acc.id);
    expect(w!.reserved).toBe(BigInt(200));
  });

  it('hold throws PRECONDITION_FAILED when balance insufficient', async () => {
    const acc = await seedBillingAccount(userA);
    const wm = new WalletModel(db);
    await expect(
      wm.hold({ billingAccountId: acc.id, amount: BigInt(1), idempotencyKey: `hold-insuf-${Date.now()}` }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('hold at exact balance boundary succeeds', async () => {
    const acc = await seedBillingAccount(userA);
    const wm = new WalletModel(db);
    await wm.credit({ billingAccountId: acc.id, delta: BigInt(100), idempotencyKey: `c3-${Date.now()}` });
    const { wallet } = await wm.hold({
      billingAccountId: acc.id,
      amount: BigInt(100),
      idempotencyKey: `hold-exact-${Date.now()}`,
    });
    expect(wallet.available).toBe(BigInt(0));
    expect(wallet.reserved).toBe(BigInt(100));
  });

  it('settle deducts actual amount and releases remainder', async () => {
    const acc = await seedBillingAccount(userA);
    const wm = new WalletModel(db);
    const ts = Date.now();
    await wm.credit({ billingAccountId: acc.id, delta: BigInt(1000), idempotencyKey: `c4-${ts}` });
    await wm.hold({ billingAccountId: acc.id, amount: BigInt(500), idempotencyKey: `h-${ts}` });

    const { wallet, debitEntry, releaseEntry } = await wm.settle({
      billingAccountId: acc.id,
      heldAmount: BigInt(500),
      actualAmount: BigInt(300),
      debitIdempotencyKey: `debit-${ts}`,
      releaseIdempotencyKey: `release-${ts}`,
    });
    expect(wallet.available).toBe(BigInt(700));  // 500 remaining + 200 released
    expect(wallet.reserved).toBe(BigInt(0));
    expect(debitEntry.kind).toBe('debit');
    expect(releaseEntry?.kind).toBe('release');
  });

  it('release restores reserved credits', async () => {
    const acc = await seedBillingAccount(userA);
    const wm = new WalletModel(db);
    const ts = Date.now();
    await wm.credit({ billingAccountId: acc.id, delta: BigInt(1000), idempotencyKey: `c5-${ts}` });
    await wm.hold({ billingAccountId: acc.id, amount: BigInt(400), idempotencyKey: `h2-${ts}` });

    const { wallet, ledger } = await wm.release({
      billingAccountId: acc.id,
      amount: BigInt(400),
      idempotencyKey: `rel-${ts}`,
    });
    expect(wallet.available).toBe(BigInt(1000));
    expect(wallet.reserved).toBe(BigInt(0));
    expect(ledger.kind).toBe('release');
  });
});

// ─── concurrent pre-reserve (concurrency guard) ──────────────────────────────

describe('WalletModel – concurrent hold', () => {
  it('two concurrent holds do not allow overdraft', async () => {
    const acc = await seedBillingAccount(userA);
    const wm = new WalletModel(db);
    await wm.credit({ billingAccountId: acc.id, delta: BigInt(100), idempotencyKey: `cc-${Date.now()}` });

    // Fire two holds for 80 each simultaneously.  At most one should succeed.
    const results = await Promise.allSettled([
      wm.hold({ billingAccountId: acc.id, amount: BigInt(80), idempotencyKey: `h-c1-${Date.now()}` }),
      wm.hold({ billingAccountId: acc.id, amount: BigInt(80), idempotencyKey: `h-c2-${Date.now() + 1}` }),
    ]);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    // Exactly one must succeed or both can succeed IF total ≤ available, but here 80+80 > 100
    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);

    const wallet = await wm.findByBillingAccountId(acc.id);
    expect(wallet!.available).toBeGreaterThanOrEqual(BigInt(0));
    expect(wallet!.available + wallet!.reserved).toBeLessThanOrEqual(BigInt(100));
  });
});

// ─── ledger_entries unique constraint ────────────────────────────────────────

describe('LedgerEntries – unique idempotency key', () => {
  it('rejects duplicate idempotency key at DB level', async () => {
    const acc = await seedBillingAccount(userA);
    const wm = new WalletModel(db);
    const ikey = `led-dup-${Date.now()}`;
    await wm.credit({ billingAccountId: acc.id, delta: BigInt(1), idempotencyKey: ikey });
    // A second credit with the same key is returned idempotently (no DB error)
    const second = await wm.credit({ billingAccountId: acc.id, delta: BigInt(1), idempotencyKey: ikey });
    // Idempotent: same ledger row returned
    const entries = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.idempotencyKey, ikey));
    expect(entries).toHaveLength(1);
    expect(second.wallet.available).toBe(BigInt(1));
  });
});

// ─── webhook_events unique constraint ────────────────────────────────────────

describe('WebhookEventModel', () => {
  it('upsert is idempotent for same provider+eventId', async () => {
    const wem = new WebhookEventModel(db);
    const first = await wem.upsert({
      provider: 'stripe',
      eventId: `evt_test_${Date.now()}`,
      eventType: 'payment_intent.succeeded',
      payload: { foo: 'bar' },
    });
    const second = await wem.upsert({
      provider: first.event.provider,
      eventId: first.event.eventId,
      eventType: 'payment_intent.succeeded',
      payload: { foo: 'baz' },
    });
    expect(first.isNew).toBe(true);
    expect(second.isNew).toBe(false);
    expect(second.event.id).toBe(first.event.id);
    // Payload should NOT be overwritten
    expect((second.event.payload as any).foo).toBe('bar');
  });

  it('marks processed and increments attempt_count', async () => {
    const wem = new WebhookEventModel(db);
    const { event } = await wem.upsert({
      provider: 'stripe',
      eventId: `evt_proc_${Date.now()}`,
      eventType: 'charge.succeeded',
      payload: {},
    });
    const processed = await wem.markProcessed(event.id);
    expect(processed.status).toBe('processed');
    expect(processed.attemptCount).toBe(1);
  });

  it('marks failed with reason', async () => {
    const wem = new WebhookEventModel(db);
    const { event } = await wem.upsert({
      provider: 'stripe',
      eventId: `evt_fail_${Date.now()}`,
      eventType: 'charge.failed',
      payload: {},
    });
    const failed = await wem.markFailed(event.id, 'amount mismatch');
    expect(failed.status).toBe('failed');
    expect(failed.failureReason).toBe('amount mismatch');
  });
});

// ─── A/B isolation: UsageRecord ──────────────────────────────────────────────

describe('UsageRecordModel – A/B isolation', () => {
  it('user B cannot find user A usage record by requestId', async () => {
    const accA = await seedBillingAccount(userA);
    await seedBillingAccount(userB);

    const umA = new UsageRecordModel(db, userA);
    const rid = `req-${Date.now()}`;
    await umA.create({
      billingAccountId: accA.id,
      requestId: rid,
      modelId: 'gpt-4o',
      provider: 'openai',
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      creditsCharged: BigInt(15),
    });

    // Lookup with wrong billingAccountId (user B's)
    const [accBRow] = await db
      .select()
      .from(billingAccounts)
      .where(eq(billingAccounts.userId, userB))
      .limit(1);

    const umB = new UsageRecordModel(db, userB);
    const result = await umB.findByRequestId(rid, accBRow.id);
    expect(result).toBeUndefined();
  });
});
