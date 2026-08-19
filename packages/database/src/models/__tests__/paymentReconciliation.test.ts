/**
 * PaymentReconciliation unit tests (mock DB — no real database).
 *
 * Scenarios:
 *  1. pending_timeout — pending order older than threshold is flagged
 *  2. pending within threshold — not flagged (empty from query)
 *  3. paid_missing_credit — paid + creditGrant > 0 + no credit ledger
 *  4. paid with credit ledger — not flagged
 *  5. paid with zero creditGrant — not flagged
 *  6. parseCreditGrant helper edge cases
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_PENDING_TIMEOUT_MINUTES,
  parseCreditGrant,
  PaymentReconciliation,
} from '../paymentReconciliation';

// ─── DB builder ───────────────────────────────────────────────────────────────

/**
 * Mock DB that returns preset rows for successive select() calls.
 * Call 1 = pending_timeout query, Call 2 = paid_missing_credit query.
 */
function makeDb(selectSequence: unknown[][]) {
  let selectCallCount = 0;
  const buildChain = () => {
    const results = selectSequence[selectCallCount++] ?? [];
    const chain: any = {
      from: () => chain,
      leftJoin: () => chain,
      where: () => chain,
      orderBy: () => Promise.resolve(results),
      limit: () => Promise.resolve(results),
    };
    return chain;
  };

  const select = vi.fn(() => buildChain());
  return { select } as any;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const oldPending = new Date(Date.now() - (DEFAULT_PENDING_TIMEOUT_MINUTES + 30) * 60 * 1000);

function makePendingRow(
  overrides: Partial<{
    orderId: string;
    orderNo: string;
    createdAt: Date;
    priceSnapshot: Record<string, string>;
  }> = {},
) {
  return {
    createdAt: oldPending,
    orderId: 'ord_pending_1',
    orderNo: 'ORD-TEST-PENDING',
    paidAt: null,
    priceSnapshot: { creditGrant: '1000' },
    status: 'pending' as const,
    ...overrides,
  };
}

function makePaidMissingCreditRow(
  overrides: Partial<{
    orderId: string;
    orderNo: string;
    creditLedgerId: null;
  }> = {},
) {
  return {
    createdAt: new Date(),
    creditLedgerId: null,
    orderId: 'ord_paid_1',
    orderNo: 'ORD-TEST-PAID',
    paidAt: new Date(),
    priceSnapshot: { creditGrant: '5000' },
    status: 'paid' as const,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── parseCreditGrant ─────────────────────────────────────────────────────────

describe('parseCreditGrant', () => {
  it('returns bigint from string creditGrant', () => {
    expect(parseCreditGrant({ creditGrant: '1000' })).toBe(1000n);
  });

  it('returns 0 for missing or invalid snapshot', () => {
    expect(parseCreditGrant(null)).toBe(0n);
    expect(parseCreditGrant({})).toBe(0n);
    expect(parseCreditGrant({ creditGrant: 'not-a-number' })).toBe(0n);
  });
});

// ─── pending_timeout ──────────────────────────────────────────────────────────

describe('pending_timeout', () => {
  it('flags stale pending orders', async () => {
    const db = makeDb([[makePendingRow()], []]);
    const reconciler = new PaymentReconciliation(db);
    const report = await reconciler.run({ lookbackHours: 24 });

    expect(report.summary.pendingTimeout).toBe(1);
    expect(report.summary.totalIssues).toBe(1);
    expect(report.issues[0]).toMatchObject({
      issueType: 'pending_timeout',
      orderId: 'ord_pending_1',
      orderNo: 'ORD-TEST-PENDING',
      status: 'pending',
    });
    expect(report.issues[0].pendingAgeMinutes).toBeGreaterThan(DEFAULT_PENDING_TIMEOUT_MINUTES);
  });

  it('reports zero when no stale pending orders in window', async () => {
    const db = makeDb([[], []]);
    const reconciler = new PaymentReconciliation(db);
    const report = await reconciler.run();

    expect(report.summary.pendingTimeout).toBe(0);
    expect(report.issues).toHaveLength(0);
  });
});

// ─── paid_missing_credit ──────────────────────────────────────────────────────

describe('paid_missing_credit', () => {
  it('flags paid orders without matching credit ledger', async () => {
    const db = makeDb([[], [makePaidMissingCreditRow()]]);
    const reconciler = new PaymentReconciliation(db);
    const report = await reconciler.run();

    expect(report.summary.paidMissingCredit).toBe(1);
    expect(report.issues[0]).toMatchObject({
      creditGrant: '5000',
      issueType: 'paid_missing_credit',
      orderId: 'ord_paid_1',
      orderNo: 'ORD-TEST-PAID',
      status: 'paid',
    });
    expect(report.issues[0].pendingAgeMinutes).toBeNull();
  });

  it('reports zero when paid orders have credit ledger (query returns empty)', async () => {
    const db = makeDb([[], []]);
    const reconciler = new PaymentReconciliation(db);
    const report = await reconciler.run();

    expect(report.summary.paidMissingCredit).toBe(0);
  });
});

// ─── combined report ──────────────────────────────────────────────────────────

describe('combined report', () => {
  it('aggregates both issue types and includes window metadata', async () => {
    const db = makeDb([[makePendingRow()], [makePaidMissingCreditRow()]]);
    const reconciler = new PaymentReconciliation(db);
    const report = await reconciler.run({ lookbackHours: 48, pendingTimeoutMinutes: 30 });

    expect(report.summary.totalIssues).toBe(2);
    expect(report.pendingTimeoutMinutes).toBe(30);
    expect(report.windowStart).toBeTruthy();
    expect(report.windowEnd).toBeTruthy();
    expect(report.ranAt).toBeTruthy();
    expect(report.issues.map((i) => i.issueType).sort()).toEqual([
      'paid_missing_credit',
      'pending_timeout',
    ]);
  });
});
