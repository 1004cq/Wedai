/**
 * StripeWebhookService unit tests
 *
 * All DB calls are mocked so this suite runs without a real database.
 *
 * Covered (ACCEPTANCE_USER_BILLING §5, §8 + WEBHOOK_IDEMPOTENCY.md §6):
 *
 *  PAY-004  Single valid success event → processed + ledger credit
 *  PAY-006  Repeated success event (serial) → idempotent, no double-credit
 *  PAY-007  Amount mismatch → failed + alert
 *  PAY-007  Currency mismatch → failed + alert
 *  PAY-008  Late failure after paid → order stays paid (no downgrade)
 *  PAY-011  Same event_id, different payload_hash → failed + alert
 *  PAY-012  Unknown event type → ignored, zero funds
 *  State    pending → closed on session.expired
 *  State    paid → cannot transition to failed/closed
 */
import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StripeWebhookService } from '../StripeWebhookService';

// ─── Mock DB + models ──────────────────────────────────────────────────────────

const mockUpsert = vi.fn();
const mockMarkFailed = vi.fn();
const mockMarkIgnored = vi.fn();
const mockMarkProcessed = vi.fn();
const mockCredit = vi.fn();

// We mock the entire @lobechat/database module
vi.mock('@lobechat/database', () => {
  const webhookEventsMock = { id: 'whe_1', status: 'pending', orderId: null, payloadHash: null, attemptCount: 0 };

  return {
    WebhookEventModel: vi.fn().mockImplementation(() => ({
      upsert: mockUpsert,
      markFailed: mockMarkFailed,
      markIgnored: mockMarkIgnored,
      markProcessed: mockMarkProcessed,
    })),
    BillingAccountModel: vi.fn().mockImplementation(() => ({})),
    OrderModel: vi.fn().mockImplementation(() => ({})),
    billingAccounts: { id: 'billingAccounts.id' },
    orders: { id: 'orders.id', status: 'orders.status' },
    webhookEvents: { id: 'webhookEvents.id', status: 'webhookEvents.status', attemptCount: 'attemptCount' },
  };
});

vi.mock('@lobechat/billing', () => ({
  BillingCommandService: vi.fn().mockImplementation(() => ({
    credit: mockCredit,
  })),
}));

// ─── Stripe event builders ─────────────────────────────────────────────────────

function makeCheckoutEvent(overrides: Record<string, any> = {}) {
  return {
    id: `evt_${crypto.randomBytes(4).toString('hex')}`,
    type: 'checkout.session.completed',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: {
      object: {
        id: 'cs_test_xxx',
        status: 'complete',
        amount_total: 9900,
        currency: 'cny',
        metadata: { orderId: 'ord_test_001' },
        ...overrides,
      },
    },
  } as any;
}

function makeOrder(overrides: Partial<{
  id: string; status: string; amountMinor: bigint; currency: string;
  billingAccountId: string; orderNo: string; priceSnapshot: any;
}> = {}) {
  return {
    id: 'ord_test_001',
    status: 'pending',
    amountMinor: BigInt(9900),
    currency: 'CNY',
    billingAccountId: 'bac_test_001',
    orderNo: 'ORD-20240801-AAA',
    priceSnapshot: { creditGrant: '1000' },
    ...overrides,
  };
}

// ─── Mock transaction helper ───────────────────────────────────────────────────

/**
 * Builds a mock `db` that runs the transaction callback synchronously,
 * and has `.select()` chains returning the provided rows.
 */
function makeMockDb(selectSequence: any[]) {
  let selectCallIndex = 0;

  const buildChain = () => {
    const rows = selectSequence[selectCallIndex++] ?? [];
    const chain: any = {
      from: () => chain,
      where: () => chain,
      for: () => chain,
      limit: () => Promise.resolve(rows),
    };
    return chain;
  };

  return {
    transaction: async (fn: (tx: any) => any) => {
      const txMock: any = {
        select: () => buildChain(),
        update: () => ({
          set: () => ({
            where: () => Promise.resolve(),
          }),
        }),
        insert: () => ({
          values: () => ({
            returning: () => Promise.resolve([{ id: 'led_001' }]),
          }),
        }),
      };
      return fn(txMock);
    },
    select: () => buildChain(),
    update: () => ({
      set: () => ({ where: () => Promise.resolve() }),
    }),
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockCredit.mockResolvedValue({ ledgerEntryId: 'led_001', availableAfter: BigInt(1000) });
  mockMarkFailed.mockResolvedValue({});
  mockMarkIgnored.mockResolvedValue({});
});

describe('PAY-004: single valid success event', () => {
  it('returns processed outcome and calls credit', async () => {
    const event = makeCheckoutEvent();
    const rawBody = JSON.stringify(event);
    const webhookRow = { id: 'whe_1', status: 'pending', orderId: null, payloadHash: null, attemptCount: 0 };
    const order = makeOrder();
    const billingAcc = { id: 'bac_test_001' };

    mockUpsert.mockResolvedValueOnce({ isNew: true, event: webhookRow });

    const db = makeMockDb([
      [webhookRow],       // FOR UPDATE event row
      [order],            // orders SELECT
      [billingAcc],       // billingAccounts SELECT
    ]);

    const svc = new StripeWebhookService(db as any);
    const result = await svc.processEvent(event, rawBody);

    expect(result.outcome).toBe('processed');
    expect(mockCredit).toHaveBeenCalledOnce();
    expect(mockCredit.mock.calls[0][0].idempotencyKey).toContain(`stripe:${event.id}:credit`);
  });
});

describe('PAY-006: repeated event → idempotent', () => {
  it('returns idempotent for already-processed event', async () => {
    const event = makeCheckoutEvent();
    const rawBody = JSON.stringify(event);
    const hash = crypto.createHash('sha256').update(rawBody, 'utf8').digest('hex');
    const processedRow = { id: 'whe_1', status: 'processed', orderId: 'ord_test_001', payloadHash: hash, attemptCount: 1 };

    // Second delivery: upsert returns isNew=false
    mockUpsert.mockResolvedValueOnce({ isNew: false, event: processedRow });

    // Transaction: FOR UPDATE returns already-processed row
    const db = makeMockDb([[processedRow]]);
    const svc = new StripeWebhookService(db as any);
    const result = await svc.processEvent(event, rawBody);

    expect(result.outcome).toBe('idempotent');
    expect(mockCredit).not.toHaveBeenCalled();
  });
});

describe('PAY-007: amount mismatch → failed + alert', () => {
  it('rejects when Stripe amount does not match local order', async () => {
    const event = makeCheckoutEvent({ amount_total: 99999 }); // wrong amount
    const rawBody = JSON.stringify(event);
    const webhookRow = { id: 'whe_1', status: 'pending', orderId: null, payloadHash: null, attemptCount: 0 };
    const order = makeOrder({ amountMinor: BigInt(9900) }); // correct amount is 9900

    mockUpsert.mockResolvedValueOnce({ isNew: true, event: webhookRow });

    const db = makeMockDb([[webhookRow], [order]]);
    const svc = new StripeWebhookService(db as any);
    const result = await svc.processEvent(event, rawBody);

    expect(result.outcome).toBe('failed');
    expect((result as any).alert).toBe(true);
    expect((result as any).reason).toContain('amount_mismatch');
    expect(mockCredit).not.toHaveBeenCalled();
  });
});

describe('PAY-007: currency mismatch → failed + alert', () => {
  it('rejects when Stripe currency does not match local order', async () => {
    const event = makeCheckoutEvent({ currency: 'usd' }); // wrong currency
    const rawBody = JSON.stringify(event);
    const webhookRow = { id: 'whe_1', status: 'pending', orderId: null, payloadHash: null, attemptCount: 0 };
    const order = makeOrder({ currency: 'CNY', amountMinor: BigInt(9900) });

    mockUpsert.mockResolvedValueOnce({ isNew: true, event: webhookRow });

    const db = makeMockDb([[webhookRow], [order]]);
    const svc = new StripeWebhookService(db as any);
    const result = await svc.processEvent(event, rawBody);

    expect(result.outcome).toBe('failed');
    expect((result as any).reason).toContain('currency_mismatch');
    expect(mockCredit).not.toHaveBeenCalled();
  });
});

describe('PAY-008: late failure after paid → order stays paid', () => {
  it('ignores failure event for an already-paid order', async () => {
    const failEvent = {
      id: `evt_fail_${Date.now()}`,
      type: 'payment_intent.payment_failed',
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      data: { object: { id: 'pi_xxx', status: 'failed', metadata: { orderId: 'ord_test_001' } } },
    } as any;
    const rawBody = JSON.stringify(failEvent);
    const webhookRow = { id: 'whe_2', status: 'pending', orderId: null, payloadHash: null, attemptCount: 0 };
    const paidOrder = makeOrder({ status: 'paid' });

    mockUpsert.mockResolvedValueOnce({ isNew: true, event: webhookRow });

    const db = makeMockDb([[webhookRow], [paidOrder]]);
    const svc = new StripeWebhookService(db as any);
    const result = await svc.processEvent(failEvent, rawBody);

    expect(result.outcome).toBe('idempotent');
    expect(mockCredit).not.toHaveBeenCalled();
  });
});

describe('PAY-011: payload hash mismatch → failed + alert', () => {
  it('rejects same event_id with different body', async () => {
    const event = makeCheckoutEvent();
    const differentBody = JSON.stringify({ ...event, extra: 'tampered' });
    const storedHash = crypto.createHash('sha256').update(JSON.stringify(event), 'utf8').digest('hex');
    const existingRow = { id: 'whe_1', status: 'pending', orderId: null, payloadHash: storedHash, attemptCount: 1 };

    mockUpsert.mockResolvedValueOnce({ isNew: false, event: existingRow });
    mockMarkFailed.mockResolvedValueOnce({});

    const db = makeMockDb([]);
    const svc = new StripeWebhookService(db as any);
    const result = await svc.processEvent(event, differentBody);

    expect(result.outcome).toBe('failed');
    expect((result as any).alert).toBe(true);
    expect((result as any).reason).toBe('payload_hash_mismatch');
    expect(mockMarkFailed).toHaveBeenCalledWith('whe_1', 'payload_hash_mismatch');
    expect(mockCredit).not.toHaveBeenCalled();
  });
});

describe('PAY-012: unknown event type → ignored, zero funds', () => {
  it('marks event ignored and returns ignored outcome', async () => {
    const unknownEvent = {
      id: `evt_unknown_${Date.now()}`,
      type: 'customer.subscription.updated',
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      data: { object: {} },
    } as any;
    const rawBody = JSON.stringify(unknownEvent);
    const webhookRow = { id: 'whe_3', status: 'pending', orderId: null, payloadHash: null, attemptCount: 0 };

    mockUpsert.mockResolvedValueOnce({ isNew: true, event: webhookRow });
    mockMarkIgnored.mockResolvedValueOnce({});

    const db = makeMockDb([]);
    const svc = new StripeWebhookService(db as any);
    const result = await svc.processEvent(unknownEvent, rawBody);

    expect(result.outcome).toBe('ignored');
    expect(mockMarkIgnored).toHaveBeenCalledWith('whe_3');
    expect(mockCredit).not.toHaveBeenCalled();
  });
});

describe('State: pending → closed on session.expired', () => {
  it('closes order without crediting wallet', async () => {
    const expiredEvent = {
      id: `evt_exp_${Date.now()}`,
      type: 'checkout.session.expired',
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      data: { object: { id: 'cs_xxx', metadata: { orderId: 'ord_test_001' } } },
    } as any;
    const rawBody = JSON.stringify(expiredEvent);
    const webhookRow = { id: 'whe_4', status: 'pending', orderId: null, payloadHash: null, attemptCount: 0 };
    const pendingOrder = makeOrder({ status: 'pending' });

    mockUpsert.mockResolvedValueOnce({ isNew: true, event: webhookRow });

    const updateCalls: string[] = [];
    const db = {
      transaction: async (fn: any) => {
        const tx: any = {
          select: () => {
            let callCount = 0;
            const rows = [[webhookRow], [pendingOrder]];
            const chain: any = {
              from: () => chain,
              where: () => chain,
              for: () => chain,
              limit: () => Promise.resolve(rows[callCount++] ?? []),
            };
            return chain;
          },
          update: (table: any) => ({
            set: (values: any) => {
              updateCalls.push(JSON.stringify(values));
              return { where: () => Promise.resolve() };
            },
          }),
        };
        return fn(tx);
      },
    };

    const svc = new StripeWebhookService(db as any);
    const result = await svc.processEvent(expiredEvent, rawBody);

    expect(result.outcome).toBe('processed');
    expect(mockCredit).not.toHaveBeenCalled();
    // Verify order was set to 'closed'
    expect(updateCalls.some((c) => c.includes('closed'))).toBe(true);
  });
});

describe('StripePaymentService: constructWebhookEvent', () => {
  it('throws when STRIPE_WEBHOOK_SECRET is missing', async () => {
    const savedSecret = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const { StripePaymentService } = await import('../StripePaymentService');
    expect(() => StripePaymentService.constructWebhookEvent('body', 'sig')).toThrow(
      'STRIPE_WEBHOOK_SECRET is not configured',
    );

    process.env.STRIPE_WEBHOOK_SECRET = savedSecret;
  });

  it('throws when STRIPE_SECRET_KEY is missing on createCheckoutSession', async () => {
    const savedKey = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;

    const { StripePaymentService } = await import('../StripePaymentService');
    await expect(
      StripePaymentService.createCheckoutSession({
        orderId: 'ord_1',
        orderNo: 'ORD-001',
        priceSnapshot: {
          planPriceId: 'pp_1',
          planId: 'pln_1',
          currency: 'CNY',
          amountMinor: BigInt(9900),
          billingInterval: 'one_time',
          snapshotAt: new Date(),
        },
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      }),
    ).rejects.toThrow('STRIPE_SECRET_KEY is not configured');

    process.env.STRIPE_SECRET_KEY = savedKey;
  });
});
