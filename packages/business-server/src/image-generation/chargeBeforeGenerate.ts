/**
 * chargeBeforeGenerate (image) — pre-flight credit hold for image generation.
 *
 * Called before the image provider API is invoked.
 * Returns prechargeItems (one per image) that the router threads through to
 * chargeAfterGenerate via asyncTask.metadata.precharge.
 *
 * Pricing: reads `model_prices.request_credits_flat` for the model.
 * If no price row exists, defaults to 0 (free — matches original no-op behaviour).
 * Admins configure per-model prices via admin.pricing.upsert.
 *
 * BYOK: image generation does not yet have a BYOK path check — all image
 * requests use platform keys. Phase 3 can add the check if BYOK image is needed.
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
  | {
      data: {
        batch: NewGenerationBatch;
        generations: NewGeneration[];
      };
      success: true;
    }
  | {
      prechargeItems?: unknown[];
    };

/** Opaque handle stored in asyncTask.metadata.precharge per image. */
interface ImagePrechargeItem {
  billingAccountId: string;
  creditsHeld: string; // bigint as string
  requestId: string;   // per-image unique, used to derive ledger ikey
}

export async function chargeBeforeGenerate(params: ChargeParams): Promise<ChargeResult> {
  const { userId, model, provider, imageNum } = params;
  if (imageNum <= 0) return undefined;

  try {
    const db = await getServerDB();

    // Look up flat credit price for this model.
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
      // No price configured → free (matches original no-op behaviour).
      return undefined;
    }

    // Get or create billing account.
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
        // Insufficient balance — release already-held images and surface error.
        for (const held of prechargeItems) {
          await billingService.release({
            billingAccountId: held.billingAccountId,
            heldCredits: BigInt(held.creditsHeld),
            holdLedgerEntryId: '', // release uses requestId-derived ikey
            reason: 'image_precharge_rollback',
            requestId: held.requestId,
          }).catch(() => {});
        }
        if (err?.code === 'PRECONDITION_FAILED') {
          // Return undefined — the router will surface the insufficiency to the user.
          return undefined;
        }
        throw err;
      }
    }

    return { prechargeItems };
  } catch {
    // Billing failure must not block image generation — degrade gracefully.
    return undefined;
  }
}
