/**
 * Manual stale-hold reaper script.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... bun packages/database/src/seed/reap-stale-holds.ts
 *   DATABASE_URL=postgresql://... HOLD_TIMEOUT_MINUTES=15 bun packages/database/src/seed/reap-stale-holds.ts
 *
 * Options (env vars):
 *   HOLD_TIMEOUT_MINUTES  — minutes after which a hold is considered stale (default: 30)
 *   REAP_BATCH_SIZE       — max holds to process per run (default: 100)
 *   DRY_RUN               — if "1", only prints what would be released without writing
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { DEFAULT_HOLD_TIMEOUT_MINUTES, StaleHoldReaper } from '../models/staleHoldReaper';

const holdTimeoutMinutes = process.env.HOLD_TIMEOUT_MINUTES
  ? Number.parseInt(process.env.HOLD_TIMEOUT_MINUTES, 10)
  : DEFAULT_HOLD_TIMEOUT_MINUTES;

const batchSize = process.env.REAP_BATCH_SIZE
  ? Number.parseInt(process.env.REAP_BATCH_SIZE, 10)
  : 100;

const isDryRun = process.env.DRY_RUN === '1';

const db = drizzle(new Pool({ connectionString: process.env.DATABASE_URL })) as any;
const reaper = new StaleHoldReaper(db, { batchSize, holdTimeoutMinutes });

async function main() {
  console.log(
    `Stale-hold reaper | timeout=${holdTimeoutMinutes}m | batch=${batchSize} | dry_run=${isDryRun}`,
  );

  if (isDryRun) {
    const count = await reaper.countActiveHolds();
    console.log(`Stale holds (older than ${holdTimeoutMinutes}m): ${count}`);
    process.exit(0);
  }

  const report = await reaper.run();

  console.log('─'.repeat(60));
  console.log(`Scanned:         ${report.scannedCount}`);
  console.log(`Released:        ${report.releasedCount}`);
  console.log(`Already settled: ${report.alreadySettledCount}`);
  console.log(`Skipped:         ${report.skippedCount}`);
  console.log(`Errors:          ${report.errorCount}`);

  if (report.errorCount > 0) {
    console.error('\nErrors:');
    for (const r of report.results.filter((r) => r.outcome === 'error')) {
      console.error(`  holdId=${r.holdId} billingAccountId=${r.billingAccountId} error=${r.errorMessage}`);
    }
  }

  if (report.releasedCount > 0) {
    console.log('\nReleased holds:');
    for (const r of report.results.filter((r) => r.outcome === 'released')) {
      console.log(
        `  holdId=${r.holdId} billingAccountId=${r.billingAccountId} requestId=${r.requestId} amount=${r.heldAmount}`,
      );
    }
  }

  process.exit(report.errorCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
