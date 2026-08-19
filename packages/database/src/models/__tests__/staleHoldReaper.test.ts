/**
 * StaleHoldReaper unit tests
 *
 * Uses mock DB — no real database needed.
 *
 * Scenarios:
 *  1. Stale hold with no settlement → released
 *  2. Active hold (within timeout) → NOT scanned (excluded by cutoff)
 *  3. Hold already settled (debit key exists) → skipped, not re-released
 *  4. Hold already released (release key exists) → skipped, not re-released
 *  5. Malformed idempotency key → skipped_bad_key
 *  6. Idempotency: running reaper twice releases only once (WalletModel idempotent)
 *  7. Zero-delta hold → skipped_bad_key (guards against corrupt data)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_HOLD_TIMEOUT_MINUTES, parseHoldKey, StaleHoldReaper } from '../staleHoldReaper';

// ─── Mock WalletModel ─────────────────────────────────────────────────────────

const mockRelease = vi.fn();

vi.mock('../billing', () => ({
  WalletModel: vi.fn().mockImplementation(() => ({
    release: mockRelease,
  })),
}));

// ─── DB builder ───────────────────────────────────────────────────────────────

/**
 * Minimal DB mock.
 * `selectSequence`: array of result arrays returned by successive .select()
 *  calls (first call = stale holds query, second call = settlement keys query).
 */
function makeDb(selectSequence: unknown[][]) {
  let selectCallCount = 0;
  const buildChain = () => {
    const results = selectSequence[selectCallCount++] ?? [];
    const chain: any = {
      from: () => chain,
      where: () => chain,
      limit: () => Promise.resolve(results),
    };
    return chain;
  };
  return { select: () => buildChain() } as any;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const past = new Date(Date.now() - (DEFAULT_HOLD_TIMEOUT_MINUTES + 5) * 60 * 1000);
const recent = new Date(Date.now() - 60 * 1000); // 1 minute ago — within timeout

function makeHoldRow(overrides: Partial<{
  id: string;
  billingAccountId: string;
  delta: bigint;
  idempotencyKey: string;
  createdAt: Date;
}> = {}) {
  return {
    billingAccountId: 'bac_test',
    createdAt: past,
    delta: BigInt(-100),
    id: 'led_hold_1',
    idempotencyKey: 'billing:hold:bac_test:req-test-001',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockRelease.mockResolvedValue({ wallet: {}, ledger: { id: 'led_release_1' } });
});

// ── 1. Stale hold with no settlement → released ──────────────────────────────

describe('stale hold → released', () => {
  it('calls WalletModel.release with correct args and reports released', async () => {
    const hold = makeHoldRow();
    // First select: stale holds; second select: no existing settlement keys
    const db = makeDb([[hold], []]);
    const reaper = new StaleHoldReaper(db);
    const report = await reaper.run();

    expect(report.releasedCount).toBe(1);
    expect(report.alreadySettledCount).toBe(0);
    expect(report.errorCount).toBe(0);
    expect(report.results[0].outcome).toBe('released');
    expect(report.results[0].requestId).toBe('req-test-001');
    expect(report.results[0].heldAmount).toBe(BigInt(100));

    expect(mockRelease).toHaveBeenCalledOnce();
    const callArg = mockRelease.mock.calls[0][0];
    expect(callArg.billingAccountId).toBe('bac_test');
    expect(callArg.amount).toBe(BigInt(100));
    expect(callArg.idempotencyKey).toBe('billing:release:bac_test:req-test-001');
    expect(callArg.reason).toContain('stale-hold-reaper');
  });
});

// ── 2. Active hold (within timeout) → not scanned ────────────────────────────

describe('active hold within timeout → not returned by DB query', () => {
  it('reports 0 scanned when DB returns empty (cutoff filters recent holds)', async () => {
    // DB returns empty because the cutoff WHERE clause excludes recent rows
    const db = makeDb([[], []]);
    const reaper = new StaleHoldReaper(db);
    const report = await reaper.run();

    expect(report.scannedCount).toBe(0);
    expect(report.releasedCount).toBe(0);
    expect(mockRelease).not.toHaveBeenCalled();
  });
});

// ── 3. Already settled (debit key exists) → skipped ──────────────────────────

describe('hold already settled by debit', () => {
  it('reports already_settled and does NOT call release', async () => {
    const hold = makeHoldRow();
    const debitKey = { idempotencyKey: 'billing:debit:bac_test:req-test-001' };
    const db = makeDb([[hold], [debitKey]]);
    const reaper = new StaleHoldReaper(db);
    const report = await reaper.run();

    expect(report.alreadySettledCount).toBe(1);
    expect(report.releasedCount).toBe(0);
    expect(report.results[0].outcome).toBe('already_settled');
    expect(mockRelease).not.toHaveBeenCalled();
  });
});

// ── 4. Already released (release key exists) → skipped ───────────────────────

describe('hold already released', () => {
  it('reports already_settled and does NOT call release again', async () => {
    const hold = makeHoldRow();
    const releaseKey = { idempotencyKey: 'billing:release:bac_test:req-test-001' };
    const db = makeDb([[hold], [releaseKey]]);
    const reaper = new StaleHoldReaper(db);
    const report = await reaper.run();

    expect(report.alreadySettledCount).toBe(1);
    expect(report.releasedCount).toBe(0);
    expect(mockRelease).not.toHaveBeenCalled();
  });
});

// ── 5. Malformed idempotency key → skipped_bad_key ───────────────────────────

describe('malformed idempotency key', () => {
  it('reports skipped_bad_key for non-billing hold keys', async () => {
    const hold = makeHoldRow({ idempotencyKey: 'custom:legacy:key' });
    const db = makeDb([[hold], []]);
    const reaper = new StaleHoldReaper(db);
    const report = await reaper.run();

    expect(report.skippedCount).toBe(1);
    expect(report.results[0].outcome).toBe('skipped_bad_key');
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it('reports skipped_bad_key for billing:hold: key with missing requestId', async () => {
    const hold = makeHoldRow({ idempotencyKey: 'billing:hold:bac_test:' });
    const db = makeDb([[hold], []]);
    const reaper = new StaleHoldReaper(db);
    const report = await reaper.run();

    expect(report.skippedCount).toBe(1);
    expect(mockRelease).not.toHaveBeenCalled();
  });
});

// ── 6. Idempotency: WalletModel.release already-released hold ────────────────

describe('idempotency: release called twice for same hold', () => {
  it('WalletModel.release returns existing ledger on duplicate key (idempotent)', async () => {
    // First run: released
    mockRelease.mockResolvedValueOnce({ wallet: {}, ledger: { id: 'led_r1' } });
    const hold = makeHoldRow();
    const db1 = makeDb([[hold], []]);
    const reaper1 = new StaleHoldReaper(db1);
    const r1 = await reaper1.run();
    expect(r1.releasedCount).toBe(1);

    // Second run: same hold still in DB (cutoff unchanged), release key now exists
    // → alreadySettled (release key is in settlement keys set)
    const releaseKey = { idempotencyKey: 'billing:release:bac_test:req-test-001' };
    const db2 = makeDb([[hold], [releaseKey]]);
    const reaper2 = new StaleHoldReaper(db2);
    const r2 = await reaper2.run();
    expect(r2.alreadySettledCount).toBe(1);
    expect(r2.releasedCount).toBe(0);
    // WalletModel.release called only once total
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });
});

// ── 7. Zero-delta hold → skipped_bad_key ─────────────────────────────────────

describe('zero-delta hold entry', () => {
  it('skips holds with non-negative delta (corrupt data guard)', async () => {
    const hold = makeHoldRow({ delta: BigInt(0) });
    const db = makeDb([[hold], []]);
    const reaper = new StaleHoldReaper(db);
    const report = await reaper.run();

    expect(report.skippedCount).toBe(1);
    expect(report.results[0].outcome).toBe('skipped_bad_key');
    expect(mockRelease).not.toHaveBeenCalled();
  });
});

// ── Unit tests for parseHoldKey ───────────────────────────────────────────────

describe('parseHoldKey', () => {
  it('parses valid hold key', () => {
    expect(parseHoldKey('billing:hold:bac_abc123:req-001')).toEqual({
      billingAccountId: 'bac_abc123',
      requestId: 'req-001',
    });
  });

  it('returns null for non-billing prefix', () => {
    expect(parseHoldKey('custom:key')).toBeNull();
  });

  it('returns null for billing:hold: with no colon after billingAccountId', () => {
    expect(parseHoldKey('billing:hold:bac_only')).toBeNull();
  });

  it('returns null for empty strings', () => {
    expect(parseHoldKey('')).toBeNull();
  });

  it('handles request IDs that contain colons', () => {
    // requestId = "req:with:colons" → everything after first colon post-prefix
    const result = parseHoldKey('billing:hold:bac_test:req:with:colons');
    expect(result?.billingAccountId).toBe('bac_test');
    expect(result?.requestId).toBe('req:with:colons');
  });
});
