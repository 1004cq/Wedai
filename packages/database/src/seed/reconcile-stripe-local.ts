/**
 * Local payment reconciliation script (read-only).
 *
 * Usage:
 *   DATABASE_URL=postgresql://... pnpm billing:reconcile
 *   DATABASE_URL=postgresql://... LOOKBACK_HOURS=48 PENDING_TIMEOUT_MINUTES=90 pnpm billing:reconcile
 *
 * Options (env vars):
 *   LOOKBACK_HOURS           — scan window in hours (default: 24)
 *   PENDING_TIMEOUT_MINUTES  — pending orders older than this are flagged (default: 60)
 *   OUTPUT_JSON              — if "1", print full JSON report to stdout
 *
 * This script performs local DB checks only. For optional Stripe Session/PI
 * enrichment, use the admin.reconciliation.report tRPC procedure.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import {
  DEFAULT_LOOKBACK_HOURS,
  DEFAULT_PENDING_TIMEOUT_MINUTES,
  PaymentReconciliation,
} from '../models/paymentReconciliation';

const lookbackHours = process.env.LOOKBACK_HOURS
  ? Number.parseInt(process.env.LOOKBACK_HOURS, 10)
  : DEFAULT_LOOKBACK_HOURS;

const pendingTimeoutMinutes = process.env.PENDING_TIMEOUT_MINUTES
  ? Number.parseInt(process.env.PENDING_TIMEOUT_MINUTES, 10)
  : DEFAULT_PENDING_TIMEOUT_MINUTES;

const outputJson = process.env.OUTPUT_JSON === '1';

const db = drizzle(new Pool({ connectionString: process.env.DATABASE_URL })) as any;
const reconciler = new PaymentReconciliation(db);

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  console.info(
    `Payment reconciliation (local) | lookback=${lookbackHours}h | pending_timeout=${pendingTimeoutMinutes}m`,
  );

  const report = await reconciler.run({ lookbackHours, pendingTimeoutMinutes });

  if (outputJson) {
    console.info(JSON.stringify(report, null, 2));
    process.exit(report.summary.totalIssues > 0 ? 1 : 0);
  }

  console.info('─'.repeat(60));
  console.info(`Window:          ${report.windowStart} → ${report.windowEnd}`);
  console.info(`Total issues:    ${report.summary.totalIssues}`);
  console.info(`  pending_timeout:      ${report.summary.pendingTimeout}`);
  console.info(`  paid_missing_credit:  ${report.summary.paidMissingCredit}`);

  if (report.issues.length > 0) {
    console.info('\nIssues:');
    for (const issue of report.issues) {
      const extra =
        issue.issueType === 'pending_timeout'
          ? ` pendingAgeMinutes=${issue.pendingAgeMinutes}`
          : ` creditGrant=${issue.creditGrant}`;
      console.info(
        `  orderId=${issue.orderId} orderNo=${issue.orderNo} status=${issue.status} issueType=${issue.issueType}${extra}`,
      );
    }
  }

  console.info(
    '\nNote: Stripe Session/PI lookup is available via admin.reconciliation.report when STRIPE_SECRET_KEY is configured.',
  );

  process.exit(report.summary.totalIssues > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
