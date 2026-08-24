/**
 * admin.users — user search, ban/unban, billing summary, profile edits.
 * All fields containing PII are returned as-is; callers are responsible
 * for access-log hygiene. Passwords and API key secrets are never returned.
 */
import { TRPCError } from '@trpc/server';
import { and, desc, eq, ilike, ne, or } from 'drizzle-orm';
import { z } from 'zod';

import { BillingAccountModel } from '@lobechat/database';

import { billingAccounts, users, wallets } from '@/database/schemas';
import { router } from '@/libs/trpc/lambda';

import { adminProcedure } from '../middleware';
import { adminUserProfileInputSchema, emptyToNull } from './userProfileInput';

export const adminUsersRouter = router({
  /** Paginated user list with optional search. */
  list: adminProcedure
    .input(
      z.object({
        cursor: z.number().default(0),
        limit: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { serverDB } = ctx;
      const { cursor, limit, search } = input;

      const where = search
        ? or(
            ilike(users.email, `%${search}%`),
            ilike(users.fullName, `%${search}%`),
            ilike(users.username, `%${search}%`),
            ilike(users.phoneNumber, `%${search}%`),
          )
        : undefined;

      const rows = await serverDB
        .select({
          available: wallets.available,
          banReason: users.banReason,
          banned: users.banned,
          createdAt: users.createdAt,
          email: users.email,
          fullName: users.fullName,
          id: users.id,
          phoneNumber: users.phoneNumber,
          role: users.role,
          username: users.username,
        })
        .from(users)
        .leftJoin(billingAccounts, eq(billingAccounts.userId, users.id))
        .leftJoin(wallets, eq(wallets.billingAccountId, billingAccounts.id))
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(limit + 1)
        .offset(cursor);

      const hasMore = rows.length > limit;
      return {
        items: rows.slice(0, limit).map((row) => ({
          ...row,
          available: row.available == null ? '0' : row.available.toString(),
        })),
        nextCursor: hasMore ? cursor + limit : null,
      };
    }),

  /** Single user with wallet balance. */
  get: adminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { serverDB } = ctx;
      const [user] = await serverDB
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

      const [account] = await serverDB
        .select()
        .from(billingAccounts)
        .where(eq(billingAccounts.userId, input.userId))
        .limit(1);

      let wallet: { available: bigint; reserved: bigint } | null = null;
      if (account) {
        const [w] = await serverDB
          .select({ available: wallets.available, reserved: wallets.reserved })
          .from(wallets)
          .where(eq(wallets.billingAccountId, account.id))
          .limit(1);
        wallet = w ?? null;
      }

      const { ...safeUser } = user;
      return { user: safeUser, billingAccountId: account?.id ?? null, wallet };
    }),

  /**
   * Create a billing account + wallet if this user does not have one yet.
   * Older signups (or failed welcome-grant bootstraps) otherwise cannot be topped up.
   */
  ensureBillingAccount: adminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { serverDB } = ctx;
      const [user] = await serverDB
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

      const bam = new BillingAccountModel(serverDB, input.userId);
      let account = await bam.findByUserId();
      if (!account) {
        try {
          account = await bam.createForUser({ currency: 'CNY' });
        } catch {
          account = await bam.findByUserId();
        }
      }
      if (!account) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create billing account',
        });
      }

      const [wallet] = await serverDB
        .select({ available: wallets.available })
        .from(wallets)
        .where(eq(wallets.billingAccountId, account.id))
        .limit(1);

      return {
        available: (wallet?.available ?? 0n).toString(),
        billingAccountId: account.id,
      };
    }),

  /** Ban or unban a user (writes ban state + reason). */
  setBan: adminProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        banned: z.boolean(),
        reason: z.string().max(256).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { serverDB } = ctx;
      const [updated] = await serverDB
        .update(users)
        .set({
          banned: input.banned,
          banReason: input.banned ? (input.reason ?? null) : null,
        })
        .where(eq(users.id, input.userId))
        .returning({ id: users.id, banned: users.banned });
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      return updated;
    }),

  /**
   * Update profile fields an operator actually needs: login identifiers,
   * display name, and role. Never returns secrets.
   */
  updateProfile: adminProcedure
    .input(adminUserProfileInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { serverDB, userId: actorId } = ctx;

      const [existing] = await serverDB
        .select({
          email: users.email,
          id: users.id,
          phoneNumber: users.phoneNumber,
          role: users.role,
          username: users.username,
        })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

      const nextEmail = input.email === undefined ? existing.email : input.email;
      const nextPhone = input.phoneNumber === undefined ? existing.phoneNumber : input.phoneNumber;
      if (!nextEmail && !nextPhone) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'User must keep either an email or a phone number',
        });
      }

      if (input.email) {
        const [dup] = await serverDB
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.email, input.email), ne(users.id, input.userId)))
          .limit(1);
        if (dup) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Email already in use' });
        }
      }

      if (input.username) {
        const [dup] = await serverDB
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.username, input.username), ne(users.id, input.userId)))
          .limit(1);
        if (dup) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Username already in use' });
        }
      }

      if (input.phoneNumber) {
        const [dup] = await serverDB
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.phoneNumber, input.phoneNumber), ne(users.id, input.userId)))
          .limit(1);
        if (dup) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Phone number already in use' });
        }
      }

      if (input.role === 'user' && input.userId === actorId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot remove your own admin role',
        });
      }

      const patch: {
        email?: string | null;
        fullName?: string | null;
        normalizedEmail?: string | null;
        phoneNumber?: string | null;
        phoneNumberVerified?: boolean | null;
        role?: string | null;
        username?: string | null;
      } = {};
      if (input.email !== undefined) {
        patch.email = input.email;
        patch.normalizedEmail = input.email;
      }
      if (input.fullName !== undefined) patch.fullName = emptyToNull(input.fullName);
      if (input.phoneNumber !== undefined) {
        patch.phoneNumber = input.phoneNumber;
        if (input.phoneNumber !== existing.phoneNumber) {
          patch.phoneNumberVerified = Boolean(input.phoneNumber);
        }
      }
      if (input.username !== undefined) patch.username = input.username;
      if (input.role !== undefined) patch.role = input.role;

      const [updated] = await serverDB
        .update(users)
        .set(patch)
        .where(eq(users.id, input.userId))
        .returning({
          banned: users.banned,
          banReason: users.banReason,
          createdAt: users.createdAt,
          email: users.email,
          fullName: users.fullName,
          id: users.id,
          phoneNumber: users.phoneNumber,
          role: users.role,
          username: users.username,
        });
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      return updated;
    }),
});
