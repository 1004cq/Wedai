/**
 * chargeAfterGenerate (image) — settle or release image generation credits.
 *
 * Called after the generation result is known (success or error).
 * Reads the opaque prechargeResult from asyncTask.metadata.precharge and
 * either settles (success) or releases (error) the hold.
 */
import { type ModelPricingContext } from '@lobechat/model-runtime';

import { type ModelPerformance, type ModelUsage } from '@/types/index';
import { BillingCommandService } from '@lobechat/billing';
import { getServerDB } from '@/database/core/db-adaptor';

interface ImagePrechargeItem {
  billingAccountId: string;
  creditsHeld: string;
  requestId: string;
}

interface ChargeParams {
  isError?: boolean;
  metadata: {
    asyncTaskId: string;
    generationBatchId: string;
    modelId: string;
    topicId?: string;
  };
  metrics?: ModelPerformance;
  modelUsage?: ModelUsage;
  prechargeResult?: unknown;
  pricingContext?: ModelPricingContext;
  provider: string;
  userId: string;
  workspaceId?: string;
}

function isPrechargeItem(v: unknown): v is ImagePrechargeItem {
  return (
    !!v &&
    typeof v === 'object' &&
    'billingAccountId' in v &&
    'creditsHeld' in v &&
    'requestId' in v
  );
}

export async function chargeAfterGenerate(params: ChargeParams): Promise<void> {
  if (!isPrechargeItem(params.prechargeResult)) return; // no precharge → nothing to do

  const item = params.prechargeResult;
  const heldCredits = BigInt(item.creditsHeld);

  try {
    const db = await getServerDB();
    const billingService = new BillingCommandService(db);

    if (params.isError) {
      // Release the hold — net credit cost = 0.
      await billingService.release({
        billingAccountId: item.billingAccountId,
        heldCredits,
        holdLedgerEntryId: '',
        reason: `image_generation_error:${params.metadata.modelId}`,
        requestId: item.requestId,
      });
    } else {
      // Settle: actual cost = held amount (flat per-request pricing, no over-estimate).
      await billingService.settle({
        actualCredits: heldCredits,
        billingAccountId: item.billingAccountId,
        heldCredits,
        holdLedgerEntryId: '',
        requestId: item.requestId,
        usage: {
          completionTokens: 0,
          modelId: params.metadata.modelId,
          promptTokens: 0,
          provider: params.provider,
          requestId: item.requestId,
          totalTokens: 0,
        },
      });
    }
  } catch {
    // Billing settlement failure must not affect the delivered generation result.
  }
}
