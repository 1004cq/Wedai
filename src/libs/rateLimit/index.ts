import crypto from 'node:crypto';

import debug from 'debug';

import { getRedisConfig } from '@/envs/redis';
import { initializeRedis } from '@/libs/redis';

import { getRateLimitConfig, policyForNamespace, type RateLimitNamespace } from './config';
import { checkMemoryFixedWindow } from './memoryStore';

const log = debug('lobe-server:rate-limit');

export interface CheckFixedWindowRateLimitInput {
  identifier: string;
  /** Test / emergency override — omit in production call sites. */
  limit?: number;
  namespace: RateLimitNamespace;
  windowSeconds?: number;
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

const hashIdentifier = (identifier: string) =>
  crypto.createHash('sha256').update(identifier).digest('hex').slice(0, 16);

const allowDecision = (limit: number, windowSeconds: number): RateLimitDecision => ({
  allowed: true,
  remaining: limit,
  resetAt: new Date(Date.now() + windowSeconds * 1000),
  retryAfterSeconds: 0,
  count: 0,
});

export const checkFixedWindowRateLimit = async (
  input: CheckFixedWindowRateLimitInput,
): Promise<RateLimitDecision> => {
  const cfg = getRateLimitConfig();
  if (!cfg.enabled) {
    return allowDecision(input.limit ?? 9999, input.windowSeconds ?? cfg.windowSeconds);
  }

  const policy = policyForNamespace(input.namespace, cfg);
  if (!policy && input.limit === undefined) {
    // Namespace disabled (e.g. image:create when RATE_LIMIT_IMAGE_PER_MIN=0).
    return allowDecision(9999, cfg.windowSeconds);
  }

  const limit = input.limit ?? policy?.limit ?? 0;
  const windowSeconds = input.windowSeconds ?? policy?.windowSeconds ?? cfg.windowSeconds;

  if (limit <= 0 || windowSeconds <= 0) {
    return allowDecision(limit || 9999, windowSeconds || 60);
  }

  const identifier = input.identifier?.trim() ? input.identifier.trim() : 'unknown';
  const keySuffix = hashIdentifier(identifier);
  const redisKey = `rate-limit:${input.namespace}:${keySuffix}`;

  try {
    const redisConfig = getRedisConfig();

    if (!redisConfig.enabled) {
      if (cfg.devMemoryFallback) {
        return checkMemoryFixedWindow(redisKey, limit, windowSeconds);
      }
      // Production without Redis: fail open (documented in config.ts header).
      return allowDecision(limit, windowSeconds);
    }

    const redis = await initializeRedis(redisConfig);
    if (!redis) {
      if (cfg.devMemoryFallback) {
        return checkMemoryFixedWindow(redisKey, limit, windowSeconds);
      }
      return allowDecision(limit, windowSeconds);
    }

    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, windowSeconds);
    }

    if (count > limit) {
      let retryAfterSeconds = windowSeconds;
      try {
        const ttl = await redis.ttl(redisKey);
        if (Number.isFinite(ttl) && ttl > 0) retryAfterSeconds = ttl;
      } catch (ttlError) {
        log('TTL read failed namespace=%s err=%O', input.namespace, ttlError);
      }

      log('blocked namespace=%s count=%d limit=%d', input.namespace, count, limit);

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
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: 0,
      resetAt: new Date(Date.now() + windowSeconds * 1000),
      count,
    };
  } catch (error) {
    log('check failed open namespace=%s err=%O', input.namespace, error);
    return allowDecision(limit, windowSeconds);
  }
};

export type { RateLimitNamespace };
