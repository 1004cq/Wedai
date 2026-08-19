// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetRateLimitConfigCache } from './config';
import { checkFixedWindowRateLimit } from './index';
import { clearMemoryRateLimitStore } from './memoryStore';

const initializeRedisMock = vi.fn();
const getRedisConfigMock = vi.fn();

vi.mock('@/libs/redis', () => ({
  initializeRedis: (...args: unknown[]) => initializeRedisMock(...args),
}));

vi.mock('@/envs/redis', () => ({
  getRedisConfig: (...args: unknown[]) => getRedisConfigMock(...args),
}));

describe('checkFixedWindowRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitConfigCache();
    clearMemoryRateLimitStore();
    delete process.env.RATE_LIMIT_DEV_MEMORY;
  });

  afterEach(() => {
    resetRateLimitConfigCache();
    clearMemoryRateLimitStore();
  });

  it('fails open in production when Redis is disabled', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    getRedisConfigMock.mockReturnValue({
      enabled: false,
      prefix: 'test',
      tls: false,
      url: '',
    });

    const res = await checkFixedWindowRateLimit({
      namespace: 'chat',
      identifier: 'user-1',
      limit: 2,
      windowSeconds: 60,
    });

    expect(res.allowed).toBe(true);
    expect(res.count).toBe(0);
  });

  it('uses in-memory store in development when Redis is disabled', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    getRedisConfigMock.mockReturnValue({
      enabled: false,
      prefix: 'test',
      tls: false,
      url: '',
    });

    await checkFixedWindowRateLimit({
      namespace: 'chat',
      identifier: 'user-1',
      limit: 2,
      windowSeconds: 60,
    });
    await checkFixedWindowRateLimit({
      namespace: 'chat',
      identifier: 'user-1',
      limit: 2,
      windowSeconds: 60,
    });

    const blocked = await checkFixedWindowRateLimit({
      namespace: 'chat',
      identifier: 'user-1',
      limit: 2,
      windowSeconds: 60,
    });

    expect(blocked.allowed).toBe(false);
    expect(blocked.count).toBe(3);
  });

  it('blocks when the Redis fixed window count exceeds the limit', async () => {
    getRedisConfigMock.mockReturnValue({
      enabled: true,
      prefix: 'test',
      tls: false,
      url: 'redis://test',
    });

    const redis = {
      incr: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValueOnce(3),
      expire: vi.fn().mockResolvedValue(1),
      ttl: vi.fn().mockResolvedValue(42),
    };

    initializeRedisMock.mockResolvedValue(redis);

    await checkFixedWindowRateLimit({
      namespace: 'chat',
      identifier: 'user-1',
      limit: 2,
      windowSeconds: 60,
    });
    await checkFixedWindowRateLimit({
      namespace: 'chat',
      identifier: 'user-1',
      limit: 2,
      windowSeconds: 60,
    });

    const blocked = await checkFixedWindowRateLimit({
      namespace: 'chat',
      identifier: 'user-1',
      limit: 2,
      windowSeconds: 60,
    });

    expect(blocked.allowed).toBe(false);
    expect(blocked.count).toBe(3);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBe(42);
  });
});
