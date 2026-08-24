/**
 * Admin wallet credits are not tied to a paid `orders` row.
 * `ledger_entries.order_id` FKs to `orders.id`, so a synthetic order id
 * (e.g. `admin-adj-*`) makes the insert fail and the balance never changes.
 */
export const buildManualCreditCommand = (input: {
  billingAccountId: string;
  credits: number;
  idempotencyKey: string;
  operatorUserId: string;
  reason: string;
}) => ({
  billingAccountId: input.billingAccountId,
  credits: BigInt(input.credits),
  idempotencyKey: `admin:credit:${input.idempotencyKey}`,
  operatorUserId: input.operatorUserId,
  reason: input.reason,
});
