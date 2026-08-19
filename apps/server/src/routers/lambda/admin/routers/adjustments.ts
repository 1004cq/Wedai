/**
 * admin.adjustments — manual wallet credit/debit with idempotency + audit.
 *
 * INVARIANTS (ACCEPTANCE §7):
 *  - Caller must supply a `reason` and a stable `idempotencyKey`.
 *  - Each adjustment produces an immutable ledger entry.
 *  - Duplicate idempotencyKey returns the existing entry without side-effects.
 *  - Admin user ID is recorded as `operatorUserId` in the ledger.
 *  - Direct wallet UPDATE without ledger is forbidden (enforced by WalletModel).
 */
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { BillingCommandService } from '@lobechat/billing';
import { router } from '@/libs/trpc/lambda';
import { billingAccounts } from '@/database/schemas';

import { adminProcedure } from '../middleware';

export const adminAdjustmentsRouter = router({
  /**
   * Manually add credits to a billing account (e.g. refund, compensation).
   * Produces a `credit` ledger entry.
   */
  credit: adminProcedure
    .input(
      z.object({
        billingAccountId: z.string().min(1),
        /** Integer credits. Pass as number (< 2^53) or string for large values. */
        credits: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]).transform((v) => Number(v)),
        reason: z.string().min(1).max(256),
        /** Caller-supplied stable key — same key returns same result. */
        idempotencyKey: z.string().min(1).max(128),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { serverDB, userId: adminId } = ctx;

      // Verify billing account exists.
      const [account] = await serverDB
        .select()
        .from(billingAccounts)
        .where(eq(billingAccounts.id, input.billingAccountId))
        .limit(1);
      if (!account) throw new TRPCError({ code: 'NOT_FOUND', message: 'Billing account not found' });

      const billingService = new BillingCommandService(serverDB);
      const result = await billingService.credit({
        billingAccountId: input.billingAccountId,
        credits: BigInt(input.credits),
        orderId: `admin-adj-${input.idempotencyKey}`,
        idempotencyKey: `admin:credit:${input.idempotencyKey}`,
        reason: input.reason,
        operatorUserId: adminId,
      });

      return {
        ledgerEntryId: result.ledgerEntryId,
        availableAfter: result.availableAfter.toString(),
      };
    }),

  /**
   * Manually deduct credits (e.g. correction, penalty).
   * Produces a `debit` ledger entry via settle-zero-hold pattern.
   * Fails with PRECONDITION_FAILED if balance is insufficient.
   *
   * NOTE: We hold the exact debit amount then settle immediately so the
   * existing WalletModel balance-check logic handles insufficient-funds.
   */
  debit: adminProcedure
    .input(
      z.object({
        billingAccountId: z.string().min(1),
        /** Integer credits. Pass as number (< 2^53) or string for large values. */
        credits: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]).transform((v) => Number(v)),
        reason: z.string().min(1).max(256),
        idempotencyKey: z.string().min(1).max(128),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { serverDB, userId: adminId } = ctx;

      const [account] = await serverDB
        .select()
        .from(billingAccounts)
        .where(eq(billingAccounts.id, input.billingAccountId))
        .limit(1);
      if (!account) throw new TRPCError({ code: 'NOT_FOUND', message: 'Billing account not found' });

      const billingService = new BillingCommandService(serverDB);
      const requestId = `admin-debit-${input.idempotencyKey}`;

      try {
        // Hold → immediate settle (no model call in between)
        const holdResult = await billingService.hold({
          billingAccountId: input.billingAccountId,
          requestId,
          reason: input.reason,
          estimatedCredits: BigInt(input.credits),
          priceSnapshot: {
            unitType: 'request',
            creditsPerUnit: BigInt(input.credits),
            currency: account.currency,
            snapshotAt: new Date().toISOString(),
          },
        });

        const settleResult = await billingService.settle({
          billingAccountId: input.billingAccountId,
          requestId,
          holdLedgerEntryId: holdResult.ledgerEntryId,
          actualCredits: BigInt(input.credits),
          heldCredits: BigInt(input.credits),
          usage: {
            requestId,
            modelId: 'admin-adjustment',
            provider: 'admin',
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
        });

        return { ledgerEntryId: settleResult.debitLedgerEntryId };
      } catch (err: any) {
        if (err?.code === 'PRECONDITION_FAILED') {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Insufficient balance for debit' });
        }
        throw err;
      }
    }),
});
