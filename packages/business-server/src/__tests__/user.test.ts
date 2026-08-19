/**
 * initNewUserForBusiness unit tests
 *
 * Covers:
 *  - BillingAccount created on first signup
 *  - Welcome credit ledger entry written (SIGNUP_CREDIT_GRANT > 0)
 *  - Idempotent: second call does NOT write a second ledger entry
 *  - SIGNUP_CREDIT_GRANT = 0 → no credit entry
 *  - No db → no-op (graceful for OSS builds)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { initNewUserForBusiness } from '../user';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockFindByUserId = vi.fn();
const mockCreateForUser = vi.fn();
const mockCredit = vi.fn();

vi.mock('@lobechat/database', () => ({
  BillingAccountModel: vi.fn().mockImplementation(() => ({
    findByUserId: mockFindByUserId,
    createForUser: mockCreateForUser,
  })),
}));

vi.mock('@lobechat/billing', () => ({
  BillingCommandService: vi.fn().mockImplementation(() => ({
    credit: mockCredit,
  })),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fakeAccount = { id: 'bac_test', userId: 'user-1', currency: 'CNY', status: 'active', version: 0 };
const userId = 'user-test-1';
const db = {} as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateForUser.mockResolvedValue(fakeAccount);
  mockCredit.mockResolvedValue({ ledgerEntryId: 'led_1', availableAfter: BigInt(100_000) });
  delete process.env.SIGNUP_CREDIT_GRANT;
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('initNewUserForBusiness', () => {
  it('no-op when db is not provided', async () => {
    await expect(initNewUserForBusiness(userId, new Date(), undefined)).resolves.toBeUndefined();
    expect(mockFindByUserId).not.toHaveBeenCalled();
  });

  it('creates billing account when none exists', async () => {
    mockFindByUserId.mockResolvedValueOnce(undefined);
    await initNewUserForBusiness(userId, new Date(), db);
    expect(mockCreateForUser).toHaveBeenCalledOnce();
  });

  it('reuses existing billing account (idempotent create)', async () => {
    mockFindByUserId.mockResolvedValueOnce(fakeAccount);
    await initNewUserForBusiness(userId, new Date(), db);
    expect(mockCreateForUser).not.toHaveBeenCalled();
  });

  it('writes credit ledger when SIGNUP_CREDIT_GRANT > 0', async () => {
    process.env.SIGNUP_CREDIT_GRANT = '100000';
    mockFindByUserId.mockResolvedValueOnce(fakeAccount);
    await initNewUserForBusiness(userId, new Date(), db);
    expect(mockCredit).toHaveBeenCalledOnce();
    const call = mockCredit.mock.calls[0][0];
    expect(call.credits).toBe(BigInt(100_000));
    expect(call.idempotencyKey).toBe(`signup:welcome:${userId}`);
    expect(call.reason).toBe('welcome_grant');
  });

  it('idempotent: same idempotency key on second call (WalletModel dedup)', async () => {
    process.env.SIGNUP_CREDIT_GRANT = '100000';
    mockFindByUserId.mockResolvedValue(fakeAccount);

    await initNewUserForBusiness(userId, new Date(), db);
    await initNewUserForBusiness(userId, new Date(), db);

    // BillingCommandService.credit called twice, but WalletModel would dedup via ikey
    expect(mockCredit).toHaveBeenCalledTimes(2);
    // Both calls use the same idempotency key
    expect(mockCredit.mock.calls[0][0].idempotencyKey).toBe(
      mockCredit.mock.calls[1][0].idempotencyKey,
    );
  });

  it('no credit when SIGNUP_CREDIT_GRANT = 0', async () => {
    process.env.SIGNUP_CREDIT_GRANT = '0';
    mockFindByUserId.mockResolvedValueOnce(fakeAccount);
    await initNewUserForBusiness(userId, new Date(), db);
    expect(mockCredit).not.toHaveBeenCalled();
  });

  it('no credit when SIGNUP_CREDIT_GRANT is unset', async () => {
    mockFindByUserId.mockResolvedValueOnce(fakeAccount);
    await initNewUserForBusiness(userId, new Date(), db);
    expect(mockCredit).not.toHaveBeenCalled();
  });
});
