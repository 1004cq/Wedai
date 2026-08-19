/**
 * rateLimitCheck — tRPC middleware for user-scoped fixed-window limits.
 *
 * Apply AFTER authedProcedure + serverDatabase + bannedCheck:
 *   authedProcedure.use(serverDatabase).use(bannedCheck).use(orderCreateRateLimit)
 */
import { TRPCError } from '@trpc/server';

import { checkFixedWindowRateLimit, type RateLimitNamespace } from '@/libs/rateLimit';

import { trpc } from '../init';

export const createUserRateLimitMiddleware = (namespace: RateLimitNamespace) =>
  trpc.middleware(async (opts) => {
    const userId = opts.ctx.userId;
    if (!userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    const decision = await checkFixedWindowRateLimit({ namespace, identifier: userId });

    if (!decision.allowed) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many requests. Please try again later.',
        cause: { retryAfterSeconds: decision.retryAfterSeconds },
      });
    }

    return opts.next({ ctx: opts.ctx });
  });

/** topUp.createOrder — per-user order creation throttle. */
export const orderCreateRateLimit = createUserRateLimitMiddleware('order:create');

/** image.createImage — optional; disabled when RATE_LIMIT_IMAGE_PER_MIN=0. */
export const imageCreateRateLimit = createUserRateLimitMiddleware('image:create');
