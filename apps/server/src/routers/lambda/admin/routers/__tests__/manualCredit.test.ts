import { describe, expect, it } from 'vitest';

import { buildManualCreditCommand } from '../manualCredit';

describe('buildManualCreditCommand', () => {
  it('does not attach a synthetic orderId that would violate ledger_entries.order_id', () => {
    const command = buildManualCreditCommand({
      billingAccountId: 'bac_1',
      credits: 500,
      idempotencyKey: 'op-1',
      operatorUserId: 'admin-1',
      reason: 'compensation',
    });

    expect(command).toEqual({
      billingAccountId: 'bac_1',
      credits: 500n,
      idempotencyKey: 'admin:credit:op-1',
      operatorUserId: 'admin-1',
      reason: 'compensation',
    });
    expect(command).not.toHaveProperty('orderId');
  });
});
