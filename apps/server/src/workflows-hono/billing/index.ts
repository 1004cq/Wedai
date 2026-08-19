/**
 * Billing background workflows — Hono sub-application.
 *
 * Routes:
 *   POST /api/workflows/billing/reap-stale-holds
 *
 * Designed to be triggered by a scheduler (cron, QStash, external cron job).
 * Requires QStash signature verification (same as other workflows).
 * Can also be called manually for maintenance.
 */
import { Hono } from 'hono';

import { qstashAuth } from '../middlewares/qstashAuth';
import { reapStaleHoldsHandler } from './handlers/reapStaleHolds';

const app = new Hono();

app.post('/reap-stale-holds', qstashAuth(), reapStaleHoldsHandler);

export default app;
