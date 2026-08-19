/**
 * admin.pricing — CRUD for model_prices table.
 * Activating a price row archives the previous active one (idempotent swap).
 */
import { TRPCError } from '@trpc/server';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { router } from '@/libs/trpc/lambda';
import { modelPrices } from '@/database/schemas';
import { idGenerator } from '@/database/utils/idGenerator';

import { adminProcedure } from '../middleware';

export const adminPricingRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.serverDB
      .select()
      .from(modelPrices)
      .where(isNull(modelPrices.archivedAt))
      .orderBy(modelPrices.provider, modelPrices.modelId);
  }),

  upsert: adminProcedure
    .input(
      z.object({
        modelId: z.string().min(1).max(128),
        provider: z.string().min(1).max(64),
        promptCreditsPerKToken: z.number().int().min(0).default(1),
        completionCreditsPerKToken: z.number().int().min(0).default(2),
        isActive: z.boolean().default(false),
        note: z.string().max(512).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { serverDB } = ctx;

      return serverDB.transaction(async (tx) => {
        // Archive the current active row for this (model, provider) if activating.
        if (input.isActive) {
          await tx
            .update(modelPrices)
            .set({ isActive: false, archivedAt: new Date() })
            .where(
              and(
                eq(modelPrices.modelId, input.modelId),
                eq(modelPrices.provider, input.provider),
                eq(modelPrices.isActive, true),
                isNull(modelPrices.archivedAt),
              ),
            );
        }

        const [row] = await tx
          .insert(modelPrices)
          .values({
            id: idGenerator('modelPrices'),
            modelId: input.modelId,
            provider: input.provider,
            promptCreditsPerKToken: BigInt(input.promptCreditsPerKToken),
            completionCreditsPerKToken: BigInt(input.completionCreditsPerKToken),
            isActive: input.isActive,
            note: input.note,
          })
          .returning();

        return row;
      });
    }),

  archive: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.serverDB
        .update(modelPrices)
        .set({ isActive: false, archivedAt: new Date() })
        .where(eq(modelPrices.id, input.id))
        .returning({ id: modelPrices.id });
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Price row not found' });
      return row;
    }),
});
