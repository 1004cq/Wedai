/**
 * Idempotent Wedai billing catalog seed.
 *
 * Upserts plans by slug and ensures each plan has an active plan_price matching
 * the catalog amount/interval (archives stale active prices first).
 * Also seeds default non-zero model_prices when missing.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... bun packages/database/src/seed/dev-billing.ts
 *   # or: pnpm --filter @lobechat/database seed:dev-billing
 */
import { and, eq, isNull, notInArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { modelPrices, planPrices, plans } from '../schemas/billing';
import { idGenerator } from '../utils/idGenerator';
import { WEDAI_PLAN_CATALOG } from './wedai-plan-catalog';

const db = drizzle(new Pool({ connectionString: process.env.DATABASE_URL }));

async function upsertPlan(entry: (typeof WEDAI_PLAN_CATALOG)[number]) {
  const [existing] = await db.select().from(plans).where(eq(plans.slug, entry.slug)).limit(1);

  if (existing) {
    await db
      .update(plans)
      .set({
        description: entry.description,
        features: entry.features,
        name: entry.name,
        sortOrder: entry.sortOrder,
        status: 'active',
        tokenGrantMonthly: entry.tokenGrantMonthly,
        updatedAt: new Date(),
      })
      .where(eq(plans.id, existing.id));
    return existing.id;
  }

  const id = idGenerator('plans');
  await db.insert(plans).values({
    description: entry.description,
    features: entry.features,
    id,
    name: entry.name,
    slug: entry.slug,
    sortOrder: entry.sortOrder,
    status: 'active',
    tokenGrantMonthly: entry.tokenGrantMonthly,
  });
  return id;
}

async function ensureActivePrice(planId: string, entry: (typeof WEDAI_PLAN_CATALOG)[number]) {
  const active = await db
    .select()
    .from(planPrices)
    .where(and(eq(planPrices.planId, planId), isNull(planPrices.archivedAt)));

  const match = active.find(
    (row) =>
      row.billingInterval === entry.billingInterval &&
      row.amountMinor === entry.amountMinor &&
      row.currency === 'CNY',
  );

  if (match) {
    // Archive any other active prices for this plan so listPlans only shows one.
    for (const row of active) {
      if (row.id === match.id) continue;
      await db.update(planPrices).set({ archivedAt: new Date() }).where(eq(planPrices.id, row.id));
    }
    return match.id;
  }

  for (const row of active) {
    await db.update(planPrices).set({ archivedAt: new Date() }).where(eq(planPrices.id, row.id));
  }

  const id = idGenerator('planPrices');
  await db.insert(planPrices).values({
    amountMinor: entry.amountMinor,
    billingInterval: entry.billingInterval,
    currency: 'CNY',
    id,
    planId,
  });
  return id;
}

async function seedModelPrices() {
  const textModels = [
    { modelId: 'gpt-4o', provider: 'openai' },
    { modelId: 'gpt-4o-mini', provider: 'openai' },
    { modelId: 'claude-3-5-sonnet-20241022', provider: 'anthropic' },
    { modelId: 'claude-3-5-haiku-20241022', provider: 'anthropic' },
    { modelId: 'deepseek-chat', provider: 'deepseek' },
    { modelId: 'gemini-1.5-pro', provider: 'google' },
  ];

  for (const m of textModels) {
    const [exists] = await db
      .select({ id: modelPrices.id })
      .from(modelPrices)
      .where(
        and(
          eq(modelPrices.modelId, m.modelId),
          eq(modelPrices.provider, m.provider),
          eq(modelPrices.isActive, true),
        ),
      )
      .limit(1);
    if (exists) continue;

    await db.insert(modelPrices).values({
      completionCreditsPerKToken: BigInt(2),
      id: idGenerator('modelPrices'),
      isActive: true,
      modelId: m.modelId,
      note: 'wedai seed - text (non-zero default)',
      promptCreditsPerKToken: BigInt(1),
      provider: m.provider,
      requestCreditsFlat: BigInt(0),
    });
  }

  const generationModels = [
    { modelId: 'dall-e-3', provider: 'openai' },
    { modelId: 'stable-diffusion-3', provider: 'stabilityai' },
  ];

  for (const m of generationModels) {
    const [exists] = await db
      .select({ id: modelPrices.id })
      .from(modelPrices)
      .where(
        and(
          eq(modelPrices.modelId, m.modelId),
          eq(modelPrices.provider, m.provider),
          eq(modelPrices.isActive, true),
        ),
      )
      .limit(1);
    if (exists) continue;

    await db.insert(modelPrices).values({
      completionCreditsPerKToken: BigInt(0),
      id: idGenerator('modelPrices'),
      isActive: true,
      modelId: m.modelId,
      note: 'wedai seed - image generation (non-zero flat)',
      promptCreditsPerKToken: BigInt(0),
      provider: m.provider,
      requestCreditsFlat: BigInt(100),
    });
  }

  return textModels.length + generationModels.length;
}

async function seed() {
  console.info('Seeding Wedai billing catalog…');

  for (const entry of WEDAI_PLAN_CATALOG) {
    const planId = await upsertPlan(entry);
    const priceId = await ensureActivePrice(planId, entry);
    const yuan = (Number(entry.amountMinor) / 100).toFixed(2);
    console.info(
      `  ✓ ${entry.slug}: ${entry.name} — ¥${yuan} / ${entry.billingInterval} → ${entry.tokenGrantMonthly} credits (plan=${planId}, price=${priceId})`,
    );
  }

  // Archive legacy active plans not in the new catalog (keep rows for FK history).
  const catalogSlugs = WEDAI_PLAN_CATALOG.map((e) => e.slug);
  const legacy = await db
    .select()
    .from(plans)
    .where(and(eq(plans.status, 'active'), notInArray(plans.slug, catalogSlugs)));

  for (const plan of legacy) {
    await db
      .update(plans)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(eq(plans.id, plan.id));
    console.info(`  ✓ archived legacy plan slug=${plan.slug}`);
  }

  const modelCount = await seedModelPrices();
  console.info(`  ✓ model_prices: ensured ${modelCount} default non-zero rates`);
  console.info('Wedai billing seed complete.');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
