/**
 * chargeAfterGenerate (video) — settle or release video generation credits.
 */
import { BillingCommandService } from '@lobechat/billing';
import { getServerDB } from '@/database/core/db-adaptor';

interface ChargeParams {
  computePriceParams?: { generateAudio?: boolean; resolution?: string };
  isError?: boolean;
  latency?: number;
  metadata: {
    asyncTaskId: string;
    generationBatchId: string;
    modelId: string;
    topicId?: string;
  };
  model: string;
  prechargeResult?: Record<string, unknown>;
  provider: string;
  usage?: { completionTokens: number; totalTokens: number };
  userId: string;
  workspaceId?: string;
}

function isVideoPrechargeResult(v: unknown): v is { billingAccountId: string; creditsHeld: string; requestId: string } {
  return !!v && typeof v === 'object' && 'billingAccountId' in v && 'creditsHeld' in v && 'requestId' in v;
}

export async function chargeAfterGenerate(params: ChargeParams): Promise<void> {
  if (!isVideoPrechargeResult(params.prechargeResult)) return;

  const { billingAccountId, creditsHeld, requestId } = params.prechargeResult;
  const heldCredits = BigInt(creditsHeld);

  try {
    const db = await getServerDB();
    const billingService = new BillingCommandService(db);

    if (params.isError) {
      await billingService.release({
        billingAccountId,
        heldCredits,
        holdLedgerEntryId: '',
        reason: `video_generation_error:${params.metadata.modelId}`,
        requestId,
      });
    } else {
      await billingService.settle({
        actualCredits: heldCredits,
        billingAccountId,
        heldCredits,
        holdLedgerEntryId: '',
        requestId,
        usage: {
          completionTokens: 0,
          modelId: params.metadata.modelId,
          promptTokens: 0,
          provider: params.provider,
          requestId,
          totalTokens: 0,
        },
      });
    }
  } catch {
    // Settlement failure must not affect the delivered video.
  }
}
