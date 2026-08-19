/**
 * Dev-only in-process fixed-window counter.
 *
 * Used when Redis is unavailable and RATE_LIMIT_DEV_MEMORY is enabled (default in
 * NODE_ENV=development). NOT suitable for multi-instance production — production
 * without Redis fails open instead.
 */
import type { RateLimitDecision } from './index';

interface MemoryEntry {
  count: number;
  expiresAtMs: number;
}

const store = new Map<string, MemoryEntry>();

export const checkMemoryFixedWindow = (
  redisKey: string,
  limit: number,
  windowSeconds: number,
): RateLimitDecision => {
  const now = Date.now();
  const existing = store.get(redisKey);

  if (!existing || existing.expiresAtMs <= now) {
    store.set(redisKey, { count: 1, expiresAtMs: now + windowSeconds * 1000 });
    return {
      allowed: true,
      count: 1,
      remaining: Math.max(0, limit - 1),
      retryAfterSeconds: 0,
      resetAt: new Date(now + windowSeconds * 1000),
    };
  }

  existing.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((existing.expiresAtMs - now) / 1000));

  if (existing.count > limit) {
    return {
      allowed: false,
      count: existing.count,
      remaining: 0,
      retryAfterSeconds,
      resetAt: new Date(existing.expiresAtMs),
    };
  }

  return {
    allowed: true,
    count: existing.count,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSeconds: 0,
    resetAt: new Date(existing.expiresAtMs),
  };
};

/** Test helper */
export const clearMemoryRateLimitStore = () => {
  store.clear();
};
