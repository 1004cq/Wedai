/** Fixed mock verify code — dev/test only when SMS mock is enabled. */
export const SMS_MOCK_VERIFY_CODE = '000000';

const phoneWindows = new Map<string, { count: number; resetAt: number }>();
const ipWindows = new Map<string, { count: number; resetAt: number }>();

const perPhoneLimit = (): number => {
  const raw = process.env.SMS_OTP_PER_PHONE_PER_MIN;
  const n = Number.parseInt(raw ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
};

const perIpLimit = (): number => {
  const raw = process.env.SMS_OTP_PER_IP_PER_MIN;
  const n = Number.parseInt(raw ?? '10', 10);
  return Number.isFinite(n) && n > 0 ? n : 10;
};

const WINDOW_MS = 60_000;

const bump = (
  store: Map<string, { count: number; resetAt: number }>,
  key: string,
  limit: number,
) => {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
  if (entry.count > limit) {
    throw new SmsRateLimitError();
  }
};

export class SmsRateLimitError extends Error {
  constructor() {
    super('SMS_RATE_LIMITED');
    this.name = 'SmsRateLimitError';
  }
}

export const assertSmsRateLimit = (phoneNumber: string, ip: string | null | undefined): void => {
  bump(phoneWindows, phoneNumber, perPhoneLimit());
  if (ip) bump(ipWindows, ip, perIpLimit());
};

export const resetSmsRateLimits = (): void => {
  phoneWindows.clear();
  ipWindows.clear();
};
