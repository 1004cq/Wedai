/**
 * Image generation billing unit tests
 *
 * Covers:
 *  - price=0 → free, no hold called
 *  - price>0, sufficient balance → hold called, prechargeItems returned
 *  - price>0, insufficient balance → { insufficientBalance: true }, no provider call
 *  - billing DB error, fail-closed (default) → throws
 *  - billing DB error, fail-open (IMAGE_BILLING_FAIL_OPEN=true) → returns undefined
 *  - chargeAfterGenerate success → settle called
 *  - chargeAfterGenerate error → release called
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockHold = vi.fn();
const mockRelease = vi.fn();
const mockSettle = vi.fn();
const mockFindByUserId = vi.fn();
const mockCreateForUser = vi.fn();

vi.mock('@lobechat/database', () => ({
  BillingAccountModel: vi.fn().mockImplementation(() => ({
    findByUserId: mockFindByUserId,
    createForUser: mockCreateForUser,
  })),
}));
vi.mock('@lobechat/billing', () => ({
  BillingCommandService: vi.fn().mockImplementation(() => ({
    hold: mockHold,
    release: mockRelease,
    settle: mockSettle,
  })),
}));

const mockDbSelect = vi.fn();
vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn(() => ({
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(mockDbSelect()) }),
      }),
    }),
  })),
}));

const fakeAccount = { id: 'bac_1', currency: 'CNY', userId: 'u1' };
const baseParams = {
  clientIp: null,
  configForDatabase: {} as any,
  generationParams: {} as any,
  generationTopicId: 'topic-1',
  imageNum: 1,
  model: 'dall-e-3',
  provider: 'openai',
  userId: 'u1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFindByUserId.mockResolvedValue(fakeAccount);
  mockHold.mockResolvedValue({ ledgerEntryId: 'led_1', holdIdempotencyKey: 'k', availableAfter: BigInt(900) });
  mockSettle.mockResolvedValue({ debitLedgerEntryId: 'led_2', releaseLedgerEntryId: null, creditsCharged: BigInt(100) });
  mockRelease.mockResolvedValue({ releaseLedgerEntryId: 'led_3' });
  delete process.env.IMAGE_BILLING_FAIL_OPEN;
});

describe('chargeBeforeGenerate', () => {
  it('price=0 → returns undefined (free model, no hold)', async () => {
    mockDbSelect.mockReturnValue([{ requestCreditsFlat: BigInt(0) }]);
    const { chargeBeforeGenerate } = await import('../image-generation/chargeBeforeGenerate');
    const result = await chargeBeforeGenerate(baseParams);
    expect(result).toBeUndefined();
    expect(mockHold).not.toHaveBeenCalled();
  });

  it('no price row → returns undefined (free by default)', async () => {
    mockDbSelect.mockReturnValue([]);
    const { chargeBeforeGenerate } = await import('../image-generation/chargeBeforeGenerate');
    const result = await chargeBeforeGenerate(baseParams);
    expect(result).toBeUndefined();
    expect(mockHold).not.toHaveBeenCalled();
  });

  it('price>0, sufficient balance → prechargeItems returned, hold called', async () => {
    mockDbSelect.mockReturnValue([{ requestCreditsFlat: BigInt(100) }]);
    const { chargeBeforeGenerate } = await import('../image-generation/chargeBeforeGenerate');
    const result = await chargeBeforeGenerate(baseParams) as any;
    expect(result?.prechargeItems).toHaveLength(1);
    expect(mockHold).toHaveBeenCalledOnce();
    expect(mockHold.mock.calls[0][0].estimatedCredits).toBe(BigInt(100));
  });

  it('price>0, insufficient balance → { insufficientBalance: true }', async () => {
    mockDbSelect.mockReturnValue([{ requestCreditsFlat: BigInt(100) }]);
    mockHold.mockRejectedValueOnce({ code: 'PRECONDITION_FAILED', message: 'Insufficient balance' });
    const { chargeBeforeGenerate } = await import('../image-generation/chargeBeforeGenerate');
    const result = await chargeBeforeGenerate(baseParams) as any;
    expect(result?.insufficientBalance).toBe(true);
  });

  it('billing DB error, fail-closed (default) → throws', async () => {
    mockDbSelect.mockReturnValue([{ requestCreditsFlat: BigInt(100) }]);
    mockHold.mockRejectedValueOnce(new Error('DB connection failed'));
    const { chargeBeforeGenerate } = await import('../image-generation/chargeBeforeGenerate');
    await expect(chargeBeforeGenerate(baseParams)).rejects.toThrow('DB connection failed');
  });

  it('billing DB error, fail-open → returns undefined', async () => {
    process.env.IMAGE_BILLING_FAIL_OPEN = 'true';
    mockDbSelect.mockReturnValue([{ requestCreditsFlat: BigInt(100) }]);
    mockHold.mockRejectedValueOnce(new Error('DB connection failed'));
    // Re-import to pick up env change
    vi.resetModules();
    const { chargeBeforeGenerate } = await import('../image-generation/chargeBeforeGenerate');
    const result = await chargeBeforeGenerate(baseParams);
    expect(result).toBeUndefined();
  });
});

describe('chargeAfterGenerate', () => {
  const validPrecharge = {
    billingAccountId: 'bac_1',
    creditsHeld: '100',
    requestId: 'img-topic-1-0-123',
  };

  it('success=true → settle called', async () => {
    const { chargeAfterGenerate } = await import('../image-generation/chargeAfterGenerate');
    await chargeAfterGenerate({
      isError: false,
      metadata: { asyncTaskId: 't1', generationBatchId: 'b1', modelId: 'dall-e-3' },
      prechargeResult: validPrecharge,
      provider: 'openai',
      userId: 'u1',
    });
    expect(mockSettle).toHaveBeenCalledOnce();
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it('isError=true → release called', async () => {
    const { chargeAfterGenerate } = await import('../image-generation/chargeAfterGenerate');
    await chargeAfterGenerate({
      isError: true,
      metadata: { asyncTaskId: 't1', generationBatchId: 'b1', modelId: 'dall-e-3' },
      prechargeResult: validPrecharge,
      provider: 'openai',
      userId: 'u1',
    });
    expect(mockRelease).toHaveBeenCalledOnce();
    expect(mockSettle).not.toHaveBeenCalled();
  });

  it('no prechargeResult → no-op', async () => {
    const { chargeAfterGenerate } = await import('../image-generation/chargeAfterGenerate');
    await chargeAfterGenerate({
      isError: false,
      metadata: { asyncTaskId: 't1', generationBatchId: 'b1', modelId: 'dall-e-3' },
      prechargeResult: undefined,
      provider: 'openai',
      userId: 'u1',
    });
    expect(mockSettle).not.toHaveBeenCalled();
    expect(mockRelease).not.toHaveBeenCalled();
  });
});
