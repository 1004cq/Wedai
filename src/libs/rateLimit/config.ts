/**
 * Rate-limit thresholds — all env-configurable, defaults intentionally loose.
 *
 * Env reference (see `.env.example`):
 *  - ENABLE_RATE_LIMIT=true|false
 *  - RATE_LIMIT_WINDOW_SECONDS=60
 *  - RATE_LIMIT_AUTH_PER_MIN=20          (login)
 *  - RATE_LIMIT_AUTH_REGISTER_PER_MIN=10
 *  - RATE_LIMIT_CHAT_PER_MIN=60
 *  - RATE_LIMIT_CHAT_IP_PER_MIN=0        (0 = disabled)
 *  - RATE_LIMIT_ORDER_PER_MIN=10
 *  - RATE_LIMIT_IMAGE_PER_MIN=0          (0 = disabled)
 *  - RATE_LIMIT_DEV_MEMORY=true|false    (in-memory fallback when Redis absent; default on in dev)
 */

const parsePositiveInt = (raw: string | undefined, fallback: number): number => {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const parseBool = (raw: string | undefined, fallback: boolean): boolean => {
  if (raw === undefined) return fallback;
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true;
  if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false;
  return fallback;
};

export type RateLimitNamespace =
  'auth:login' | 'auth:register' | 'chat' | 'chat:ip' | 'order:create' | 'image:create';

export interface RateLimitPolicy {
  limit: number;
  windowSeconds: number;
}

export interface RateLimitConfig {
  authLogin: RateLimitPolicy;
  authRegister: RateLimitPolicy;
  chat: RateLimitPolicy;
  chatIp: RateLimitPolicy | null;
  devMemoryFallback: boolean;
  enabled: boolean;
  image: RateLimitPolicy | null;
  orderCreate: RateLimitPolicy;
}

let cached: RateLimitConfig | null = null;

export const getRateLimitConfig = (): RateLimitConfig => {
  if (cached) return cached;

  const windowSeconds = parsePositiveInt(process.env.RATE_LIMIT_WINDOW_SECONDS, 60);
  const enabled = parseBool(process.env.ENABLE_RATE_LIMIT, true);
  const devMemoryFallback =
    parseBool(process.env.RATE_LIMIT_DEV_MEMORY, process.env.NODE_ENV === 'development') &&
    process.env.NODE_ENV !== 'production';

  const chatIpLimit = parsePositiveInt(process.env.RATE_LIMIT_CHAT_IP_PER_MIN, 0);
  const imageLimit = parsePositiveInt(process.env.RATE_LIMIT_IMAGE_PER_MIN, 0);

  cached = {
    enabled,
    windowSeconds,
    devMemoryFallback,
    authLogin: {
      limit: parsePositiveInt(process.env.RATE_LIMIT_AUTH_PER_MIN, 20),
      windowSeconds,
    },
    authRegister: {
      limit: parsePositiveInt(process.env.RATE_LIMIT_AUTH_REGISTER_PER_MIN, 10),
      windowSeconds,
    },
    chat: {
      limit: parsePositiveInt(process.env.RATE_LIMIT_CHAT_PER_MIN, 60),
      windowSeconds,
    },
    chatIp: chatIpLimit > 0 ? { limit: chatIpLimit, windowSeconds } : null,
    orderCreate: {
      limit: parsePositiveInt(process.env.RATE_LIMIT_ORDER_PER_MIN, 10),
      windowSeconds,
    },
    image: imageLimit > 0 ? { limit: imageLimit, windowSeconds } : null,
  };

  return cached;
};

/** Test helper — reset memoized config between cases. */
export const resetRateLimitConfigCache = () => {
  cached = null;
};

export const policyForNamespace = (
  namespace: RateLimitNamespace,
  cfg = getRateLimitConfig(),
): RateLimitPolicy | null => {
  switch (namespace) {
    case 'auth:login': {
      return cfg.authLogin;
    }
    case 'auth:register': {
      return cfg.authRegister;
    }
    case 'chat': {
      return cfg.chat;
    }
    case 'chat:ip': {
      return cfg.chatIp;
    }
    case 'order:create': {
      return cfg.orderCreate;
    }
    case 'image:create': {
      return cfg.image;
    }
    default: {
      return null;
    }
  }
};
