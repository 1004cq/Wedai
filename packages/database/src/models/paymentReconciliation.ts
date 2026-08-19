/**
 * PaymentReconciliation — read-only local consistency checks for Wedai orders.
 *
 * Detects anomalies within a configurable time window:
 *  - pending_timeout:     order stuck in `pending` longer than the threshold
 *  - paid_missing_credit: order is `paid`, creditGrant > 0, but no credit ledger row
 *
 * This module NEVER mutates orders, ledger entries, or wallets.
 * Stripe API enrichment lives in the server layer (StripeReconciliationEnricher).
 */
import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm';

import type { OrderStatus } from '../schemas/billing';
import { ledgerEntries, orders } from '../schemas/billing';
import type { LobeChatDatabase } from '../type';

// ─── Configuration ────────────────────────────────────────────────────────────

/** Default pending timeout — aligns with typical Stripe Checkout expiry alerts. */
export const DEFAULT_PENDING_TIMEOUT_MINUTES = 60;

/** Default lookback window when scanning for anomalies. */
export const DEFAULT_LOOKBACK_HOURS = 24;

export type ReconciliationIssueType = 'pending_timeout' | 'paid_missing_credit';

export interface PaymentReconciliationOptions {
  /** How far back to scan (hours). Default: 24. */
  lookbackHours?: number;
  /** Orders in `pending` older than this are flagged. Default: 60 minutes. */
  pendingTimeoutMinutes?: number;
  /** Optional explicit window end (ISO). Default: now. */
  windowEnd?: Date;
  /** Optional explicit window start (ISO). Overrides lookbackHours when set. */
  windowStart?: Date;
}

export interface ReconciliationIssue {
  createdAt: string;
  /** Expected credit grant from price snapshot (stringified bigint). */
  creditGrant: string | null;
  issueType: ReconciliationIssueType;
  orderId: string;
  orderNo: string;
  paidAt: string | null;
  /** Minutes the order has been pending (pending_timeout only). */
  pendingAgeMinutes: number | null;
  status: OrderStatus;
}

export interface PaymentReconciliationReport {
  issues: ReconciliationIssue[];
  pendingTimeoutMinutes: number;
  ranAt: string;
  summary: {
    totalIssues: number;
    pendingTimeout: number;
    paidMissingCredit: number;
  };
  windowEnd: string;
  windowStart: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function parseCreditGrant(priceSnapshot: unknown): bigint {
  if (!priceSnapshot || typeof priceSnapshot !== 'object') return 0n;
  const raw = (priceSnapshot as { creditGrant?: string }).creditGrant;
  if (!raw) return 0n;
  try {
    return BigInt(raw);
  } catch {
    return 0n;
  }
}

function resolveWindow(options: PaymentReconciliationOptions): {
  windowStart: Date;
  windowEnd: Date;
  pendingTimeoutMinutes: number;
} {
  const windowEnd = options.windowEnd ?? new Date();
  const lookbackHours = options.lookbackHours ?? DEFAULT_LOOKBACK_HOURS;
  const windowStart =
    options.windowStart ?? new Date(windowEnd.getTime() - lookbackHours * 60 * 60 * 1000);
  const pendingTimeoutMinutes = options.pendingTimeoutMinutes ?? DEFAULT_PENDING_TIMEOUT_MINUTES;

  return { pendingTimeoutMinutes, windowEnd, windowStart };
}

// ─── Reconciler ───────────────────────────────────────────────────────────────

export class PaymentReconciliation {
  constructor(private readonly db: LobeChatDatabase) {}

  /**
   * Runs local-only reconciliation checks. Safe to re-run; no side effects.
   */
  async run(options: PaymentReconciliationOptions = {}): Promise<PaymentReconciliationReport> {
    const { pendingTimeoutMinutes, windowEnd, windowStart } = resolveWindow(options);
    const pendingCutoff = new Date(windowEnd.getTime() - pendingTimeoutMinutes * 60 * 1000);

    const [pendingIssues, paidIssues] = await Promise.all([
      this.findPendingTimeouts(windowStart, windowEnd, pendingCutoff),
      this.findPaidMissingCredit(windowStart, windowEnd),
    ]);

    const issues = [...pendingIssues, ...paidIssues].sort(
      (a, b) => a.issueType.localeCompare(b.issueType) || a.orderNo.localeCompare(b.orderNo),
    );

    return {
      issues,
      pendingTimeoutMinutes,
      ranAt: new Date().toISOString(),
      summary: {
        paidMissingCredit: paidIssues.length,
        pendingTimeout: pendingIssues.length,
        totalIssues: issues.length,
      },
      windowEnd: windowEnd.toISOString(),
      windowStart: windowStart.toISOString(),
    };
  }

  private async findPendingTimeouts(
    windowStart: Date,
    windowEnd: Date,
    pendingCutoff: Date,
  ): Promise<ReconciliationIssue[]> {
    const rows = await this.db
      .select({
        createdAt: orders.createdAt,
        orderId: orders.id,
        orderNo: orders.orderNo,
        paidAt: orders.paidAt,
        priceSnapshot: orders.priceSnapshot,
        status: orders.status,
      })
      .from(orders)
      .where(
        and(
          eq(orders.status, 'pending'),
          gte(orders.createdAt, windowStart),
          lt(orders.createdAt, windowEnd),
          lt(orders.createdAt, pendingCutoff),
        ),
      )
      .orderBy(orders.createdAt);

    const nowMs = windowEnd.getTime();

    return rows.map((row) => {
      const ageMs = nowMs - row.createdAt.getTime();
      return {
        createdAt: row.createdAt.toISOString(),
        creditGrant: parseCreditGrant(row.priceSnapshot).toString(),
        issueType: 'pending_timeout' as const,
        orderId: row.orderId,
        orderNo: row.orderNo,
        paidAt: row.paidAt?.toISOString() ?? null,
        pendingAgeMinutes: Math.floor(ageMs / 60_000),
        status: row.status,
      };
    });
  }

  private async findPaidMissingCredit(
    windowStart: Date,
    windowEnd: Date,
  ): Promise<ReconciliationIssue[]> {
    const rows = await this.db
      .select({
        createdAt: orders.createdAt,
        creditLedgerId: ledgerEntries.id,
        orderId: orders.id,
        orderNo: orders.orderNo,
        paidAt: orders.paidAt,
        priceSnapshot: orders.priceSnapshot,
        status: orders.status,
      })
      .from(orders)
      .leftJoin(
        ledgerEntries,
        and(eq(ledgerEntries.orderId, orders.id), eq(ledgerEntries.kind, 'credit')),
      )
      .where(
        and(
          eq(orders.status, 'paid'),
          gte(sql`coalesce(${orders.paidAt}, ${orders.createdAt})`, windowStart),
          lt(sql`coalesce(${orders.paidAt}, ${orders.createdAt})`, windowEnd),
          sql`coalesce((${orders.priceSnapshot}->>'creditGrant')::bigint, 0) > 0`,
          isNull(ledgerEntries.id),
        ),
      )
      .orderBy(orders.paidAt);

    return rows.map((row) => ({
      createdAt: row.createdAt.toISOString(),
      creditGrant: parseCreditGrant(row.priceSnapshot).toString(),
      issueType: 'paid_missing_credit' as const,
      orderId: row.orderId,
      orderNo: row.orderNo,
      paidAt: row.paidAt?.toISOString() ?? null,
      pendingAgeMinutes: null,
      status: row.status,
    }));
  }
}
