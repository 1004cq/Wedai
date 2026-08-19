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
import { adminLedgerRouter } from './routers/ledger';
import { adminOrdersRouter } from './routers/orders';
import { adminPricingRouter } from './routers/pricing';
import { adminUsersRouter } from './routers/users';
import { adminWebhooksRouter } from './routers/webhooks';

export const adminRouter = router({
  adjustments: adminAdjustmentsRouter,
  ledger: adminLedgerRouter,
  orders: adminOrdersRouter,
  pricing: adminPricingRouter,
  users: adminUsersRouter,
  webhooks: adminWebhooksRouter,
});
