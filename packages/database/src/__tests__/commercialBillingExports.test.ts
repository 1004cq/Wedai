/**
 * Regression: commercial Docker/Next build imports billing models + schema
 * tables from the package root (`@lobechat/database`). Missing re-exports
 * previously made `npm run build:docker` fail with Turbopack "Export X
 * doesn't exist in target module".
 */
import { describe, expect, it } from 'vitest';

describe('@lobechat/database commercial billing exports', () => {
  it('re-exports billing models and schema tables from package root', async () => {
    const db = await import('../index');

    expect(db.BillingAccountModel).toBeTypeOf('function');
    expect(db.OrderModel).toBeTypeOf('function');
    expect(db.UsageRecordModel).toBeTypeOf('function');
    expect(db.WalletModel).toBeTypeOf('function');
    expect(db.WebhookEventModel).toBeTypeOf('function');
    expect(db.billingAccounts).toBeDefined();
    expect(db.modelPrices).toBeDefined();
    expect(db.orders).toBeDefined();
    expect(db.webhookEvents).toBeDefined();
  });
});
