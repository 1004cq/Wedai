/**
 * Development-only billing seed.
 *
 * Creates one free plan, one paid plan with a CNY price, and default model
 * prices so the Plans page shows content and chargeBeforeChat has a rate.
 *
 * ONLY run against a local/isolated test database.
 * Production databases should have plans managed via admin.pricing.* tRPC.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... bun packages/database/src/seed/dev-billing.ts
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { idGenerator } from '../utils/idGenerator';
import { modelPrices, planPrices, plans } from '../schemas/billing';

const db = drizzle(new Pool({ connectionString: process.env.DATABASE_URL }));

async function seed() {
  console.log('Seeding dev billing data…');

  // ── Plans ──────────────────────────────────────────────────────────────────
  const freePlanId = idGenerator('plans');
  const proPlanId = idGenerator('plans');

  await db
    .insert(plans)
    .values([
      {
        id: freePlanId,
        slug: 'free',
        name: 'Free',
        description: '每月 100k tokens，体验平台功能。',
        status: 'active',
        tokenGrantMonthly: BigInt(100_000),
        features: { maxModels: 3, prioritySupport: false },
        sortOrder: 0,
      },
      {
        id: proPlanId,
        slug: 'pro_monthly',
        name: 'Pro（月付）',
        description: '每月 5M tokens，解锁全部模型，优先支持。',
        status: 'active',
        tokenGrantMonthly: BigInt(5_000_000),
        features: { maxModels: 999, prioritySupport: true },
        sortOrder: 1,
      },
    ])
    .onConflictDoNothing();

  console.log('  ✓ plans: free, pro_monthly');

  // ── Plan prices ────────────────────────────────────────────────────────────
  const freePriceId = idGenerator('planPrices');
  const proPriceId = idGenerator('planPrices');

  await db
    .insert(planPrices)
    .values([
      {
        id: freePriceId,
        planId: freePlanId,
        currency: 'CNY',
        amountMinor: BigInt(0),    // 0 fen = free
        billingInterval: 'monthly',
        // creditGrant comes from plans.tokenGrantMonthly (100_000), read by
        // PriceSnapshotService.freezeSnapshot() at order creation time.
      },
      {
        id: proPriceId,
        planId: proPlanId,
        currency: 'CNY',
        amountMinor: BigInt(3900), // ¥39.00
        billingInterval: 'monthly',
        // creditGrant comes from plans.tokenGrantMonthly (5_000_000)
      },
    ])
    .onConflictDoNothing();

  console.log('  ✓ plan_prices: free (¥0), pro_monthly (¥39.00)');

  // ── Model prices ──────────────────────────────────────────────────────────
  // 1 credit per 1 000 prompt tokens, 2 credits per 1 000 completion tokens
  // for common models. Admin can override via admin.pricing.upsert.
  // Text models (token-based pricing)
  const textModels = [
    { modelId: 'gpt-4o', provider: 'openai' },
    { modelId: 'gpt-4o-mini', provider: 'openai' },
    { modelId: 'claude-3-5-sonnet-20241022', provider: 'anthropic' },
    { modelId: 'claude-3-5-haiku-20241022', provider: 'anthropic' },
    { modelId: 'deepseek-chat', provider: 'deepseek' },
    { modelId: 'gemini-1.5-pro', provider: 'google' },
  ];

  await db
    .insert(modelPrices)
    .values(
      textModels.map((m) => ({
        id: idGenerator('modelPrices'),
        modelId: m.modelId,
        provider: m.provider,
        promptCreditsPerKToken: BigInt(1),
        completionCreditsPerKToken: BigInt(2),
        requestCreditsFlat: BigInt(0),
        isActive: true,
        note: 'dev seed - text',
      })),
    )
    .onConflictDoNothing();

  // Image/video models (per-request flat pricing, 100 credits per generation)
  const generationModels = [
    { modelId: 'dall-e-3', provider: 'openai' },
    { modelId: 'stable-diffusion-3', provider: 'stabilityai' },
  ];

  await db
    .insert(modelPrices)
    .values(
      generationModels.map((m) => ({
        id: idGenerator('modelPrices'),
        modelId: m.modelId,
        provider: m.provider,
        promptCreditsPerKToken: BigInt(0),
        completionCreditsPerKToken: BigInt(0),
        requestCreditsFlat: BigInt(100),
        isActive: true,
        note: 'dev seed - image generation',
      })),
    )
    .onConflictDoNothing();

  const defaultModels = [...textModels, ...generationModels];

  console.log(`  ✓ model_prices: ${textModels.length} text + ${generationModels.length} image models seeded`);
  console.log('Dev billing seed complete.');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
