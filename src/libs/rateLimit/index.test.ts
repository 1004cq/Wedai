// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkFixedWindowRateLimit } from './index';

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
  });

  it('fails open when Redis is disabled', async () => {
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

  it('blocks when the fixed window count exceeds the limit', async () => {
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
