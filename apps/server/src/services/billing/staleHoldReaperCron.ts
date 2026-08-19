import debug from 'debug';

import { getServerDB } from '@/database/core/db-adaptor';
import { StaleHoldReaper } from '@/database/models/staleHoldReaper';

const log = debug('lobe-server:billing:reap-stale-holds:cron');

export interface BillingReaperCronStatus {
  enabled: boolean;
  inFlight: boolean;
  intervalMs: number;
  lastRunAt?: string;
  lastScannedCount?: number;
  lastReleasedCount?: number;
  lastAlreadySettledCount?: number;
  lastError?: string;
  nextRunAt?: string;
}

const DEFAULT_INTERVAL_SECONDS = 600; // 10 minutes

let inFlight = false;
let timer: NodeJS.Timeout | undefined;

let lastRunAt: Date | undefined;
let lastReport:
  | {
      scannedCount: number;
      releasedCount: number;
      alreadySettledCount: number;
    }
  | undefined;
let lastError: string | undefined;
let nextRunAt: Date | undefined;

const acquireIntervalMs = () => {
  const seconds = process.env.BILLING_HOLD_REAPER_INTERVAL_SECONDS;
  const parsed = seconds ? Number.parseInt(seconds, 10) : DEFAULT_INTERVAL_SECONDS;

  // Clamp to reasonable bounds to avoid accidental 0/NaN config.
  const safeSeconds = Number.isFinite(parsed) ? Math.max(30, Math.min(parsed, 86400)) : DEFAULT_INTERVAL_SECONDS;
  return safeSeconds * 1000;
};

export const getBillingReaperCronStatus = (): BillingReaperCronStatus => ({
  enabled: process.env.ENABLE_BILLING_HOLD_REAPER_CRON !== 'false',
  inFlight,
  intervalMs: acquireIntervalMs(),
  lastRunAt: lastRunAt?.toISOString(),
  lastScannedCount: lastReport?.scannedCount,
  lastReleasedCount: lastReport?.releasedCount,
  lastAlreadySettledCount: lastReport?.alreadySettledCount,
  lastError,
  nextRunAt: nextRunAt?.toISOString(),
});

const parseHoldTimeoutMinutes = () => {
  const value = process.env.BILLING_HOLD_TIMEOUT_MINUTES;
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(1, parsed) : undefined;
};

const parseBatchSize = () => {
  const value = process.env.REAP_BATCH_SIZE;
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(1, parsed) : undefined;
};

export const startStaleHoldReaperCron = () => {
  if (timer) return; // already started
  if (process.env.ENABLE_BILLING_HOLD_REAPER_CRON === 'false') return;

  const intervalMs = acquireIntervalMs();

  const runOnce = async () => {
    if (inFlight) return;
    inFlight = true;

    try {
      lastError = undefined;
      nextRunAt = undefined;

      const db = await getServerDB();
      const reaper = new StaleHoldReaper(db, {
        holdTimeoutMinutes: parseHoldTimeoutMinutes(),
        batchSize: parseBatchSize(),
      });

      const report = await reaper.run();
      lastRunAt = report.ranAt;
      lastReport = {
        scannedCount: report.scannedCount,
        releasedCount: report.releasedCount,
        alreadySettledCount: report.alreadySettledCount,
      };

      log(
        'reap-stale-holds complete scanned=%d released=%d alreadySettled=%d errors=%d',
        report.scannedCount,
        report.releasedCount,
        report.alreadySettledCount,
        report.errorCount,
      );
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      log('reap-stale-holds failed: %O', e);
    } finally {
      inFlight = false;
    }
  };

  void runOnce();

  timer = setInterval(() => {
    nextRunAt = new Date(Date.now() + intervalMs);
    void runOnce();
  }, intervalMs);

  // Allow clean shutdowns / worker exits.
  timer.unref?.();
};

