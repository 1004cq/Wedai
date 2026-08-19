/**
 * chargeAfterChat — settle or release credits after the model call completes.
 *
 * Called by the chat route AFTER the response stream/non-stream finishes.
 */
import {
  BillingCommandService,
  UsageNormalizer,
} from '@lobechat/billing';
import type { NormalizedUsage } from '@lobechat/billing';
import { UsageRecordModel } from '@lobechat/database';
import type { LobeChatDatabase } from '@lobechat/database';

import type { ChatBillingContext } from './chargeBeforeChat';

// ─── Params ───────────────────────────────────────────────────────────────────

export interface ChargeAfterChatParams {
  db: LobeChatDatabase;
  userId: string;
  billingContext: ChatBillingContext;
  /** Whether the model call succeeded (response delivered to user). */
  success: boolean;
  /** Raw token usage from the provider response (may be undefined on error). */
  rawUsage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  modelId: string;
  provider: string;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export async function chargeAfterChat(params: ChargeAfterChatParams): Promise<void> {
  const { billingContext, db, userId } = params;

  // BYOK or zero-cost request → nothing to settle.
  if (!billingContext.charged || billingContext.heldCredits === 0n) {
    return;
  }

  const billingService = new BillingCommandService(db);

  // ── Failure path: release the entire hold ──────────────────────────────────
  if (!params.success) {
    if (billingContext.holdResult) {
      await billingService.release({
        billingAccountId: billingContext.billingAccountId,
        requestId: billingContext.requestId,
        holdLedgerEntryId: billingContext.holdResult.ledgerEntryId,
        heldCredits: billingContext.heldCredits,
        reason: 'model call failed/aborted',
      });
    }
    return;
  }

  // ── Success path: normalise usage, compute actual credits, settle ──────────
  const usage: NormalizedUsage = UsageNormalizer.normalize({
    requestId: billingContext.requestId,
    modelId: params.modelId,
    provider: params.provider,
    raw: params.rawUsage ?? {},
  });

  const actualCredits = billingContext.priceSnapshot
    ? UsageNormalizer.computeCredits(usage, billingContext.priceSnapshot)
    : 0n;

  if (billingContext.holdResult && billingContext.heldCredits > 0n) {
    await billingService.settle({
      billingAccountId: billingContext.billingAccountId,
      requestId: billingContext.requestId,
      holdLedgerEntryId: billingContext.holdResult.ledgerEntryId,
      actualCredits,
      heldCredits: billingContext.heldCredits,
      usage,
    });
  }

  // Write the usage record for audit/reporting.
  const usageModel = new UsageRecordModel(db, userId);
  try {
    await usageModel.create({
      billingAccountId: billingContext.billingAccountId,
      requestId: billingContext.requestId,
      modelId: params.modelId,
      provider: params.provider,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      creditsCharged: actualCredits,
      settlementStatus: 'settled',
    });
  } catch (err: any) {
    // Duplicate requestId — usage_record already written (idempotent retry).
    // The unique index (request_id, billing_account_id) prevents double-writes.
    if (err?.constraint?.includes('request_id') || err?.code === '23505') {
      return;
    }
    throw err;
  }
}
