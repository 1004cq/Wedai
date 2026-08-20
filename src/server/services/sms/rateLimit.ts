type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60_000;

const getPhoneLimit = (): number =>
  Number.parseInt(process.env.SMS_OTP_PER_PHONE_PER_MIN ?? '1', 10) || 1;

const getIpLimit = (): number =>
  Number.parseInt(process.env.SMS_OTP_PER_IP_PER_MIN ?? '10', 10) || 10;

const prune = (now: number) => {
  if (buckets.size < 10_000) return;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > WINDOW_MS * 2) buckets.delete(key);
  }
};

const hit = (key: string, max: number): boolean => {
  const now = Date.now();
  prune(now);
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return false;
  }
  bucket.count += 1;
  return bucket.count > max;
};

export class SmsRateLimitError extends Error {
  constructor() {
    super('SMS_RATE_LIMIT');
    this.name = 'SmsRateLimitError';
  }
}

export const assertSmsRateLimit = (phoneNumber: string, ip: string | null | undefined): void => {
  const phoneKey = `sms:phone:${phoneNumber}`;
  const ipKey = `sms:ip:${ip ?? 'unknown'}`;

  if (hit(phoneKey, getPhoneLimit())) {
    throw new SmsRateLimitError();
  }
  if (hit(ipKey, getIpLimit())) {
    throw new SmsRateLimitError();
  }
};

/** Test helper */
export const resetSmsRateLimits = (): void => {
  buckets.clear();
};
