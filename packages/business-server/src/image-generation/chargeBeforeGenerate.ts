/**
 * chargeBeforeGenerate (image) — pre-flight credit hold for image generation.
 *
 * ## Fail-closed behaviour
 *
 * By default (production): billing errors BLOCK image generation.
 *   - InsufficientBalance → `{ insufficientBalance: true }` (router shows top-up UI)
 *   - DB/billing error → throw (router returns 500; provider never called)
 *
 * To allow billing errors to pass through (e.g. dev without DB):
 *   Set env IMAGE_BILLING_FAIL_OPEN=true
 *
 * ## request_credits_flat = 0 semantics
 *
 * 0 means the model is intentionally free (e.g. open-source or promotional).
 * Paid models MUST have a non-zero price configured via admin.pricing.upsert
 * or pnpm db:seed:dev.  Without a price row the model is treated as free.
 */
import { and, eq, isNull } from 'drizzle-orm';

import { type NewGeneration, type NewGenerationBatch } from '@/database/schemas';
import { modelPrices } from '@/database/schemas/billing';
import { getServerDB } from '@/database/core/db-adaptor';
import type { CreateImageServicePayload } from '@/server/routers/lambda/image';
import { BillingAccountModel } from '@lobechat/database';
import { BillingCommandService } from '@lobechat/billing';

interface ChargeParams {
  clientIp?: string | null;
  configForDatabase: CreateImageServicePayload['params'];
  generationParams: CreateImageServicePayload['params'];
  generationTopicId: string;
  imageNum: number;
  model: string;
  provider: string;
  userId: string;
  workspaceId?: string;
}

type ChargeResult =
  | undefined
  | { data: { batch: NewGenerationBatch; generations: NewGeneration[] }; success: true }
  | { prechargeItems?: unknown[] }
  | { insufficientBalance: true };

interface ImagePrechargeItem {
  billingAccountId: string;
  creditsHeld: string;
  requestId: string;
}

const isFailOpen = () => process.env.IMAGE_BILLING_FAIL_OPEN === 'true';

export async function chargeBeforeGenerate(params: ChargeParams): Promise<ChargeResult> {
  const { userId, model, provider, imageNum } = params;
  if (imageNum <= 0) return undefined;

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

    const creditsPerImage = priceRow?.requestCreditsFlat ?? BigInt(0);
    if (creditsPerImage <= 0n) {
      // Explicitly free model (requestCreditsFlat=0 or no price row).
      return undefined;
    }

    const bam = new BillingAccountModel(db, userId);
    let account = await bam.findByUserId();
    if (!account) account = await bam.createForUser({ currency: 'CNY' });

    const billingService = new BillingCommandService(db);
    const prechargeItems: ImagePrechargeItem[] = [];

    for (let i = 0; i < imageNum; i++) {
      const requestId = `img-${params.generationTopicId}-${i}-${Date.now()}`;
      try {
        await billingService.hold({
          billingAccountId: account.id,
          estimatedCredits: creditsPerImage,
          priceSnapshot: {
            creditsPerUnit: creditsPerImage,
            currency: account.currency,
            snapshotAt: new Date().toISOString(),
            unitType: 'request',
          },
          reason: `image:${provider}:${model}:${i}`,
          requestId,
        });
        prechargeItems.push({
          billingAccountId: account.id,
          creditsHeld: creditsPerImage.toString(),
          requestId,
        });
      } catch (err: any) {
        // Release already-held items for this generation batch.
        for (const held of prechargeItems) {
          await billingService.release({
            billingAccountId: held.billingAccountId,
            heldCredits: BigInt(held.creditsHeld),
            holdLedgerEntryId: '',
            reason: 'image_precharge_rollback',
            requestId: held.requestId,
          }).catch(() => {});
        }
        if (err?.code === 'PRECONDITION_FAILED') {
          // Insufficient balance — return structured error for router to handle.
          return { insufficientBalance: true };
        }
        // Other billing error — fail-closed by default.
        if (isFailOpen()) return undefined;
        throw err;
      }
    }

    return { prechargeItems };
  } catch (err) {
    // Outer catch: DB connection failure or other infrastructure error.
    if (isFailOpen()) {
      console.error('[image-billing] fail-open: billing error suppressed', err);
      return undefined;
    }
    throw err;
  }
}
