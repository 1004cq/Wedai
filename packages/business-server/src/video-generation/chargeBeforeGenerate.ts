/**
 * chargeBeforeGenerate (video) — pre-flight credit hold for video generation.
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
  data: {
    batch: NewGenerationBatch;
    generations: NewGeneration[];
  };
  success: true;
}

interface ChargeBeforeResult {
  errorBatch?: ErrorBatch;
  prechargeResult?: Record<string, unknown>;
}

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

    return {
      prechargeResult: {
        billingAccountId: account.id,
        creditsHeld: creditsToHold.toString(),
        requestId,
      },
    };
  } catch {
    return {};
  }
}
