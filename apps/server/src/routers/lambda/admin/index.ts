/**
 * Admin tRPC router — all procedures require role='admin' (server-side check).
 *
 * Sub-routers:
 *   admin.users.*       — list, search, ban/unban, view billing
 *   admin.orders.*      — list, inspect by order/provider/event ID
 *   admin.ledger.*      — read-only append-only ledger view
 *   admin.pricing.*     — CRUD model_prices rows
 *   admin.adjustments.* — manual wallet credit/debit with idempotency + audit
 */
import { router } from '@/libs/trpc/lambda';

import { adminAdjustmentsRouter } from './routers/adjustments';
import { adminConfigRouter } from './routers/config';
import { adminDashboardRouter } from './routers/dashboard';
import { adminLedgerRouter } from './routers/ledger';
import { adminOrdersRouter } from './routers/orders';
import { adminPricingRouter } from './routers/pricing';
import { adminReconciliationRouter } from './routers/reconciliation';
import { adminUsersRouter } from './routers/users';
import { adminWebhooksRouter } from './routers/webhooks';

export const adminRouter = router({
  adjustments: adminAdjustmentsRouter,
  config: adminConfigRouter,
  dashboard: adminDashboardRouter,
  ledger: adminLedgerRouter,
  orders: adminOrdersRouter,
  pricing: adminPricingRouter,
  reconciliation: adminReconciliationRouter,
  users: adminUsersRouter,
  webhooks: adminWebhooksRouter,
});
