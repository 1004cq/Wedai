/**
 * reapStaleHoldsHandler — HTTP handler for the stale-hold reaper job.
 *
 * Triggered by POST /api/workflows/billing/reap-stale-holds.
 *
 * Accepts an optional JSON body:
 *   { holdTimeoutMinutes?: number; batchSize?: number }
 *
 * If holdTimeoutMinutes is omitted, falls back to env var
 * BILLING_HOLD_TIMEOUT_MINUTES, then defaults to 30.
 *
 * Returns the full StaleHoldReaperReport as JSON.
 * Always returns 200 (workflow engines should not retry on business errors).
 * Logs a structured summary for observability.
 */
import debug from 'debug';
import type { Context } from 'hono';

import { getServerDB } from '@/database/core/db-adaptor';
import { StaleHoldReaper } from '@/database/models/staleHoldReaper';

const log = debug('lobe-server:billing:reap-stale-holds');

interface ReapRequestBody {
  batchSize?: number;
  holdTimeoutMinutes?: number;
}

export const reapStaleHoldsHandler = async (c: Context) => {
  let body: ReapRequestBody = {};
  try {
    body = await c.req.json<ReapRequestBody>();
  } catch {
    // No body or non-JSON body — use defaults.
  }

  const holdTimeoutMinutes =
    body.holdTimeoutMinutes ??
    (process.env.BILLING_HOLD_TIMEOUT_MINUTES
      ? Number.parseInt(process.env.BILLING_HOLD_TIMEOUT_MINUTES, 10)
      : undefined);

  const batchSize = body.batchSize;

  const db = await getServerDB();
  const reaper = new StaleHoldReaper(db, { batchSize, holdTimeoutMinutes });

  const report = await reaper.run();

  log(
    'reap-stale-holds complete: scanned=%d released=%d alreadySettled=%d errors=%d',
    report.scannedCount,
    report.releasedCount,
    report.alreadySettledCount,
    report.errorCount,
  );

  if (report.errorCount > 0) {
    console.error('[billing-reaper] Some holds could not be released:', {
      errors: report.results
        .filter((r) => r.outcome === 'error')
        .map((r) => ({
          billingAccountId: r.billingAccountId,
          errorMessage: r.errorMessage,
          holdId: r.holdId,
        })),
    });
  }

  return c.json(report, 200);
};
