/**
 * chargeBeforeGenerate (video) — pre-flight credit hold for video generation.
 *
 * Fail-closed: billing errors block the provider call by default.
 * Set VIDEO_BILLING_FAIL_OPEN=true to allow billing errors to pass through.
 *
 * request_credits_flat=0 → free model (intentional).
 */
import { and, eq, isNull } from 'drizzle-orm';

import type { NewGeneration, NewGenerationBatch } from '@/database/schemas';
import { modelPrices } from '@/database/schemas/billing';
import { getServerDB } from '@/database/core/db-adaptor';
import type { CreateVideoServicePayload } from '@/server/routers/lambda/video';
import { BillingAccountModel } from '@lobechat/database';
import { BillingCommandService } from '@lobechat/billing';

interface ChargeParams {
  generationTopicId: string;
  model: string;
  params: CreateVideoServicePayload['params'];
  provider: string;
  userId: string;
  workspaceId?: string;
}

interface ErrorBatch {
  data: { batch: NewGenerationBatch; generations: NewGeneration[] };
  success: true;
}

interface ChargeBeforeResult {
  errorBatch?: ErrorBatch;
  insufficientBalance?: true;
  prechargeResult?: Record<string, unknown>;
}

const isFailOpen = () => process.env.VIDEO_BILLING_FAIL_OPEN === 'true';

export async function chargeBeforeGenerate(params: ChargeParams): Promise<ChargeBeforeResult> {
  const { userId, model, provider, generationTopicId } = params;

  try {
    const db = await getServerDB();

    const [priceRow] = await db
      .select({ requestCreditsFlat: modelPrices.requestCreditsFlat })
      .from(modelPrices)
      .where(
        and(
          eq(modelPrices.modelId, model),
          eq(modelPrices.provider, provider),
          eq(modelPrices.isActive, true),
          isNull(modelPrices.archivedAt),
        ),
      )
      .limit(1);

    const creditsToHold = priceRow?.requestCreditsFlat ?? BigInt(0);
    if (creditsToHold <= 0n) return {};

    const bam = new BillingAccountModel(db, userId);
    let account = await bam.findByUserId();
    if (!account) account = await bam.createForUser({ currency: 'CNY' });

    const billingService = new BillingCommandService(db);
    const requestId = `vid-${generationTopicId}-${Date.now()}`;

    try {
      await billingService.hold({
        billingAccountId: account.id,
        estimatedCredits: creditsToHold,
        priceSnapshot: {
          creditsPerUnit: creditsToHold,
          currency: account.currency,
          snapshotAt: new Date().toISOString(),
          unitType: 'request',
        },
        reason: `video:${provider}:${model}`,
        requestId,
      });
    } catch (err: any) {
      if (err?.code === 'PRECONDITION_FAILED') {
        return { insufficientBalance: true };
      }
      if (isFailOpen()) return {};
      throw err;
    }

    return {
      prechargeResult: {
        billingAccountId: account.id,
        creditsHeld: creditsToHold.toString(),
        requestId,
      },
    };
  } catch (err) {
    if (isFailOpen()) {
      console.error('[video-billing] fail-open: billing error suppressed', err);
      return {};
    }
    throw err;
  }
}
