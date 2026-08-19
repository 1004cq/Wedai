import crypto from 'node:crypto';

import debug from 'debug';

import { getRedisConfig } from '@/envs/redis';
import { initializeRedis } from '@/libs/redis';

const log = debug('lobe-server:rate-limit');

export interface CheckFixedWindowRateLimitInput {
  /**
   * Stable key material (userId / ip / etc). This value will be hashed to avoid
   * leaking raw identifiers into Redis key space.
   */
  identifier: string;
  limit: number;
  namespace: string;
  windowSeconds: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Current request count in the window. */
  count: number;
  /**
   * Remaining requests in the current window. When `allowed=false`, this
   * will be 0.
   */
  remaining: number;
  /** Reset time estimation (based on Redis TTL when available). */
  resetAt: Date;
  /** Seconds until retry is recommended (same as remaining window TTL). */
  retryAfterSeconds: number;
}

const shouldEnableRateLimit = () => {
  // Fail-open in case of misconfiguration: disable only when explicitly asked.
  const v = (process.env.ENABLE_RATE_LIMIT ?? 'true').trim().toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'off' && v !== 'no';
};

const hashIdentifier = (identifier: string) =>
  crypto.createHash('sha256').update(identifier).digest('hex');

export const checkFixedWindowRateLimit = async (
  input: CheckFixedWindowRateLimitInput,
): Promise<RateLimitDecision> => {
  if (!shouldEnableRateLimit()) {
    return {
      allowed: true,
      remaining: input.limit,
      resetAt: new Date(Date.now() + input.windowSeconds * 1000),
      retryAfterSeconds: 0,
      count: 0,
    };
  }

  const limit = Number.isFinite(input.limit) ? input.limit : 0;
  const windowSeconds = Number.isFinite(input.windowSeconds) ? input.windowSeconds : 0;

  if (limit <= 0 || windowSeconds <= 0) {
    // Misconfiguration: fail-open.
    return {
      allowed: true,
      remaining: input.limit,
      resetAt: new Date(Date.now() + windowSeconds * 1000),
      retryAfterSeconds: 0,
      count: 0,
    };
  }

  const identifier = input.identifier?.trim() ? input.identifier.trim() : 'unknown';
  const keySuffix = hashIdentifier(identifier);
  const redisKey = `rate-limit:${input.namespace}:${keySuffix}`;

  try {
    const config = getRedisConfig();
    if (!config.enabled) {
      return {
        allowed: true,
        remaining: input.limit,
        resetAt: new Date(Date.now() + input.windowSeconds * 1000),
        retryAfterSeconds: 0,
        count: 0,
      };
    }

    const redis = await initializeRedis(config);
    if (!redis) {
      return {
        allowed: true,
        remaining: input.limit,
        resetAt: new Date(Date.now() + input.windowSeconds * 1000),
        retryAfterSeconds: 0,
        count: 0,
      };
    }

    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, input.windowSeconds);
    }

    if (count > input.limit) {
      let retryAfterSeconds = input.windowSeconds;
      try {
        const ttl = await redis.ttl(redisKey);
        if (Number.isFinite(ttl) && ttl > 0) retryAfterSeconds = ttl;
      } catch (ttlError) {
        log('Failed to read Redis TTL for %s: %O', redisKey, ttlError);
      }

      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds,
        resetAt: new Date(Date.now() + retryAfterSeconds * 1000),
        count,
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, input.limit - count),
      retryAfterSeconds: 0,
      resetAt: new Date(Date.now() + input.windowSeconds * 1000),
      count,
    };
  } catch (error) {
    // Rate limiting should fail open to avoid blocking legitimate traffic.
    log('Rate limit check failed open (%s): %O', input.namespace, error);
    return {
      allowed: true,
      remaining: input.limit,
      resetAt: new Date(Date.now() + input.windowSeconds * 1000),
      retryAfterSeconds: 0,
      count: 0,
    };
  }
};
