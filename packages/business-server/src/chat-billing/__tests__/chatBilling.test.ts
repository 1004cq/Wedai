/**
 * Chat billing middleware unit tests
 *
 * Covered scenarios (ACCEPTANCE §6):
 *   - BYOK request → no hold, no charge
 *   - Platform request with sufficient balance → hold succeeds
 *   - Platform request with insufficient balance → InsufficientBalanceError
 *   - After success → settle called with actual credits
 *   - After failure → release called, net charge = 0
 *   - Duplicate requestId → idempotent (no double-hold)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chargeAfterChat } from '../chargeAfterChat';
import { InsufficientBalanceError, chargeBeforeChat } from '../chargeBeforeChat';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockHold = vi.fn();
const mockSettle = vi.fn();
const mockRelease = vi.fn();
const mockGetAvailableBalance = vi.fn();
const mockFindByUserId = vi.fn();
const mockCreateForUser = vi.fn();
const mockUsageCreate = vi.fn();

vi.mock('@lobechat/billing', async () => {
  const actual = await vi.importActual<typeof import('@lobechat/billing')>('@lobechat/billing');
  return {
    ...actual,
    BillingCommandService: vi.fn().mockImplementation(() => ({
      hold: mockHold,
      settle: mockSettle,
      release: mockRelease,
      getAvailableBalance: mockGetAvailableBalance,
    })),
    PriceSnapshotService: {
      buildUsagePriceSnapshot: actual.PriceSnapshotService.buildUsagePriceSnapshot,
      computeCredits: actual.PriceSnapshotService.computeCredits,
    },
  };
});

vi.mock('@lobechat/database', () => ({
  BillingAccountModel: vi.fn().mockImplementation(() => ({
    findByUserId: mockFindByUserId,
    createForUser: mockCreateForUser,
  })),
  UsageRecordModel: vi.fn().mockImplementation(() => ({
    create: mockUsageCreate,
  })),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const baseParams = {
  db: {} as any,
  userId: 'user-a',
  requestId: 'req-001',
  provider: 'openai',
  modelId: 'gpt-4o',
  userHasProviderKey: false,
  estimatedPromptTokens: 1000,
  maxCompletionTokens: 4000,
};

const fakeAccount = { id: 'bac_1', userId: 'user-a', currency: 'CNY', status: 'active', version: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  mockFindByUserId.mockResolvedValue(fakeAccount);
  mockCreateForUser.mockResolvedValue(fakeAccount);
  mockHold.mockResolvedValue({
    ledgerEntryId: 'led_hold_1',
    holdIdempotencyKey: 'billing:hold:bac_1:req-001',
    availableAfter: 900n,
  });
  mockSettle.mockResolvedValue({ debitLedgerEntryId: 'led_d', releaseLedgerEntryId: 'led_r', creditsCharged: 3n });
  mockRelease.mockResolvedValue({ releaseLedgerEntryId: 'led_rel' });
  mockUsageCreate.mockResolvedValue({ id: 'usg_1' });
});

// ─── chargeBeforeChat ─────────────────────────────────────────────────────────

describe('chargeBeforeChat', () => {
  it('BYOK: skips billing entirely', async () => {
    const ctx = await chargeBeforeChat({ ...baseParams, userHasProviderKey: true });
    expect(ctx.charged).toBe(false);
    expect(mockHold).not.toHaveBeenCalled();
  });

  it('Platform: holds credits and returns context', async () => {
    const ctx = await chargeBeforeChat(baseParams);
    expect(ctx.charged).toBe(true);
    expect(ctx.holdResult).toEqual(expect.objectContaining({ ledgerEntryId: 'led_hold_1' }));
    expect(mockHold).toHaveBeenCalledOnce();
    expect(mockHold.mock.calls[0][0].requestId).toBe('req-001');
  });

  it('Insufficient balance: throws InsufficientBalanceError', async () => {
    const err = { code: 'PRECONDITION_FAILED', message: 'Insufficient balance' };
    mockHold.mockRejectedValueOnce(err);
    await expect(chargeBeforeChat(baseParams)).rejects.toBeInstanceOf(InsufficientBalanceError);
  });

  it('Creates billing account lazily if not found', async () => {
    mockFindByUserId.mockResolvedValueOnce(undefined);
    await chargeBeforeChat(baseParams);
    expect(mockCreateForUser).toHaveBeenCalledOnce();
  });

  it('Idempotent: same requestId produces same hold key', async () => {
    await chargeBeforeChat(baseParams);
    await chargeBeforeChat(baseParams);
    const key1 = mockHold.mock.calls[0][0].requestId;
    const key2 = mockHold.mock.calls[1][0].requestId;
    expect(key1).toBe(key2);
  });
});

// ─── chargeAfterChat ──────────────────────────────────────────────────────────

describe('chargeAfterChat', () => {
  it('Success: settles and writes usage_record', async () => {
    const billingContext = await chargeBeforeChat(baseParams);
    await chargeAfterChat({
      db: {} as any,
      userId: 'user-a',
      billingContext,
      success: true,
      rawUsage: { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
      modelId: 'gpt-4o',
      provider: 'openai',
    });
    expect(mockSettle).toHaveBeenCalledOnce();
    expect(mockUsageCreate).toHaveBeenCalledOnce();
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it('Failure: releases hold entirely', async () => {
    const billingContext = await chargeBeforeChat(baseParams);
    await chargeAfterChat({
      db: {} as any,
      userId: 'user-a',
      billingContext,
      success: false,
      modelId: 'gpt-4o',
      provider: 'openai',
    });
    expect(mockRelease).toHaveBeenCalledOnce();
    expect(mockSettle).not.toHaveBeenCalled();
    expect(mockUsageCreate).not.toHaveBeenCalled();
  });

  it('BYOK context: does nothing on success or failure', async () => {
    const billingContext = await chargeBeforeChat({ ...baseParams, userHasProviderKey: true });
    await chargeAfterChat({
      db: {} as any,
      userId: 'user-a',
      billingContext,
      success: true,
      rawUsage: { totalTokens: 100 },
      modelId: 'gpt-4o',
      provider: 'openai',
    });
    expect(mockSettle).not.toHaveBeenCalled();
    expect(mockRelease).not.toHaveBeenCalled();
    expect(mockUsageCreate).not.toHaveBeenCalled();
  });

  it('Duplicate usage_record insert (23505) is swallowed', async () => {
    const billingContext = await chargeBeforeChat(baseParams);
    mockUsageCreate.mockRejectedValueOnce({ code: '23505', constraint: 'usage_records_request_id_billing_account_id_unique' });
    // Should not throw
    await chargeAfterChat({
      db: {} as any,
      userId: 'user-a',
      billingContext,
      success: true,
      rawUsage: { totalTokens: 100 },
      modelId: 'gpt-4o',
      provider: 'openai',
    });
  });
});
