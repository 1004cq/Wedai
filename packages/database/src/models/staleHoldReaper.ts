/**
 * StaleHoldReaper — finds and releases ledger hold entries that have not been
 * settled or released within a configurable timeout.
 *
 * ## Why holds can go stale
 *
 * `chargeBeforeChat` writes a `hold` ledger entry and reserves credits in the
 * wallet.  `chargeAfterChat` settles or releases the hold when the request
 * completes.  If the server process crashes, the client disconnects ungracefully,
 * or the settlement write fails silently, the hold entry remains open and the
 * reserved balance is locked indefinitely.
 *
 * ## Detection strategy
 *
 * We scan `ledger_entries WHERE kind = 'hold' AND created_at < now - timeout`.
 * For each hold entry we check whether a `debit` or `release` entry with the
 * SAME `billing:release:{billingAccountId}:{requestId}` or
 * `billing:debit:{billingAccountId}:{requestId}` key already exists.  If yes,
 * the hold has been settled — we skip it.  If no, we call `WalletModel.release`
 * with the derived idempotency key.
 *
 * `WalletModel.release` is itself idempotent (checks the release key first), so
 * running the reaper multiple times is safe.
 *
 * ## Key parsing
 *
 * Hold idempotency keys follow the format:
 *   `billing:hold:{billingAccountId}:{requestId}`
 *
 * Parsing extracts `billingAccountId` and `requestId` to derive the counterpart
 * release/debit keys.  Entries that don't match this pattern are skipped.
 *
 * ## No float / no direct wallet UPDATE
 *
 * `WalletModel.release` uses bigint arithmetic and writes a `release` ledger
 * entry before touching the wallet balance.  This reaper never bypasses ledger.
 */
import { and, eq, inArray, lt, sql } from 'drizzle-orm';

import { ledgerEntries, wallets } from '../schemas/billing';
import type { LobeChatDatabase } from '../type';
import { WalletModel } from './billing';

// ─── Configuration ────────────────────────────────────────────────────────────

export const DEFAULT_HOLD_TIMEOUT_MINUTES = 30;
export const DEFAULT_BATCH_SIZE = 100;

export interface StaleHoldReaperOptions {
  /** Minutes after hold creation before it is considered stale. Default: 30. */
  holdTimeoutMinutes?: number;
  /** Maximum number of stale holds to process per run. Default: 100. */
  batchSize?: number;
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface StaleHoldResult {
  holdId: string;
  billingAccountId: string;
  requestId: string;
  heldAmount: bigint;
  outcome: 'released' | 'already_settled' | 'skipped_bad_key' | 'error';
  errorMessage?: string;
}

export interface StaleHoldReaperReport {
  scannedCount: number;
  releasedCount: number;
  alreadySettledCount: number;
  skippedCount: number;
  errorCount: number;
  results: StaleHoldResult[];
  ranAt: Date;
}

// ─── Key parsing ──────────────────────────────────────────────────────────────

const HOLD_KEY_PREFIX = 'billing:hold:';

/**
 * Parses a hold idempotency key into its components.
 * Returns null if the key does not match the expected format.
 *
 * Format: `billing:hold:{billingAccountId}:{requestId}`
 * Note: billingAccountId itself can contain colons (unlikely but possible),
 * so we split on the FOURTH colon to capture the requestId as everything after.
 * Actually billingAccountId = `bac_{12chars}` (no colons), so splitting at the
 * third colon is safe: prefix(2) + billingAccountId + requestId.
 *
 * "billing:hold:bac_abc123:req-xyz-001"
 *  → { billingAccountId: "bac_abc123", requestId: "req-xyz-001" }
 */
export function parseHoldKey(key: string): { billingAccountId: string; requestId: string } | null {
  if (!key.startsWith(HOLD_KEY_PREFIX)) return null;
  const rest = key.slice(HOLD_KEY_PREFIX.length); // "{billingAccountId}:{requestId}"
  const colonIdx = rest.indexOf(':');
  if (colonIdx <= 0) return null;
  const billingAccountId = rest.slice(0, colonIdx);
  const requestId = rest.slice(colonIdx + 1);
  if (!billingAccountId || !requestId) return null;
  return { billingAccountId, requestId };
}

// ─── Reaper ───────────────────────────────────────────────────────────────────

export class StaleHoldReaper {
  private readonly holdTimeoutMinutes: number;
  private readonly batchSize: number;

  constructor(
    private readonly db: LobeChatDatabase,
    options: StaleHoldReaperOptions = {},
  ) {
    this.holdTimeoutMinutes = options.holdTimeoutMinutes ?? DEFAULT_HOLD_TIMEOUT_MINUTES;
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  }

  /**
   * Scans for stale holds and releases them.
   *
   * Safe to call concurrently or repeatedly — idempotency is enforced by
   * `WalletModel.release` via the unique `release` idempotency key.
   */
  async run(): Promise<StaleHoldReaperReport> {
    const ranAt = new Date();
    const cutoff = new Date(Date.now() - this.holdTimeoutMinutes * 60 * 1000);

    // 1. Find stale hold entries.
    const staleHolds = await this.db
      .select({
        id: ledgerEntries.id,
        billingAccountId: ledgerEntries.billingAccountId,
        delta: ledgerEntries.delta,
        idempotencyKey: ledgerEntries.idempotencyKey,
        createdAt: ledgerEntries.createdAt,
      })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.kind, 'hold'),
          lt(ledgerEntries.createdAt, cutoff),
        ),
      )
      .limit(this.batchSize);

    if (staleHolds.length === 0) {
      return {
        alreadySettledCount: 0,
        errorCount: 0,
        ranAt,
        releasedCount: 0,
        results: [],
        scannedCount: 0,
        skippedCount: 0,
      };
    }

    // 2. Build the set of counterpart keys to check for existing settlements.
    const parsedHolds = staleHolds.map((hold) => {
      const parsed = parseHoldKey(hold.idempotencyKey);
      return { hold, parsed };
    });

    const settlementKeys: string[] = [];
    for (const { parsed } of parsedHolds) {
      if (parsed) {
        settlementKeys.push(
          `billing:debit:${parsed.billingAccountId}:${parsed.requestId}`,
          `billing:release:${parsed.billingAccountId}:${parsed.requestId}`,
        );
      }
    }

    // 3. Fetch which settlement keys already exist (batch query).
    const existingKeys = new Set<string>();
    if (settlementKeys.length > 0) {
      const existing = await this.db
        .select({ idempotencyKey: ledgerEntries.idempotencyKey })
        .from(ledgerEntries)
        .where(inArray(ledgerEntries.idempotencyKey, settlementKeys));
      for (const row of existing) existingKeys.add(row.idempotencyKey);
    }

    // 4. Process each stale hold.
    const results: StaleHoldResult[] = [];
    const walletModel = new WalletModel(this.db);

    for (const { hold, parsed } of parsedHolds) {
      if (!parsed) {
        results.push({
          billingAccountId: hold.billingAccountId,
          errorMessage: `Cannot parse hold key: ${hold.idempotencyKey}`,
          heldAmount: -hold.delta, // delta is negative for holds
          holdId: hold.id,
          outcome: 'skipped_bad_key',
          requestId: '',
        });
        continue;
      }

      const { billingAccountId, requestId } = parsed;
      const debitKey = `billing:debit:${billingAccountId}:${requestId}`;
      const releaseKey = `billing:release:${billingAccountId}:${requestId}`;

      // Already settled (debit or release exists)?
      if (existingKeys.has(debitKey) || existingKeys.has(releaseKey)) {
        results.push({
          billingAccountId,
          heldAmount: -hold.delta,
          holdId: hold.id,
          outcome: 'already_settled',
          requestId,
        });
        continue;
      }

      // Hold amount: ledger delta for holds is negative (available↓, reserved↑)
      const heldAmount = -hold.delta;
      if (heldAmount <= 0n) {
        results.push({
          billingAccountId,
          errorMessage: `Unexpected non-negative delta on hold entry: ${hold.delta}`,
          heldAmount: 0n,
          holdId: hold.id,
          outcome: 'skipped_bad_key',
          requestId,
        });
        continue;
      }

      // Release the stale hold.
      try {
        await walletModel.release({
          amount: heldAmount,
          billingAccountId,
          idempotencyKey: releaseKey,
          reason: `stale-hold-reaper: auto-released after ${this.holdTimeoutMinutes}m`,
          usageRecordId: undefined,
        });

        results.push({
          billingAccountId,
          heldAmount,
          holdId: hold.id,
          outcome: 'released',
          requestId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({
          billingAccountId,
          errorMessage: message,
          heldAmount,
          holdId: hold.id,
          outcome: 'error',
          requestId,
        });
      }
    }

    const releasedCount = results.filter((r) => r.outcome === 'released').length;
    const alreadySettledCount = results.filter((r) => r.outcome === 'already_settled').length;
    const skippedCount = results.filter((r) => r.outcome === 'skipped_bad_key').length;
    const errorCount = results.filter((r) => r.outcome === 'error').length;

    return {
      alreadySettledCount,
      errorCount,
      ranAt,
      releasedCount,
      results,
      scannedCount: staleHolds.length,
      skippedCount,
    };
  }

  /**
   * Returns the count of currently open holds (created_at ≥ cutoff — within timeout window).
   * Useful for monitoring / alerting on wallet health.
   */
  async countActiveHolds(): Promise<number> {
    const cutoff = new Date(Date.now() - this.holdTimeoutMinutes * 60 * 1000);
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.kind, 'hold'), lt(ledgerEntries.createdAt, cutoff)));
    return row?.count ?? 0;
  }
}
