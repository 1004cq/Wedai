import { afterEach, describe, expect, it } from 'vitest';

import {
  formatPhoneForDisplay,
  normalizePhoneToE164,
  toDomesticPhoneNumber,
} from '@/libs/phone/normalizePhone';
import {
  assertSmsRateLimit,
  resetSmsRateLimits,
  SMS_MOCK_VERIFY_CODE,
  SmsRateLimitError,
} from '@/server/services/sms/rateLimit';

describe('normalizePhoneToE164', () => {
  it('normalizes 11-digit domestic', () => {
    expect(normalizePhoneToE164('13800138000')).toBe('+8613800138000');
  });

  it('accepts +86 prefix', () => {
    expect(normalizePhoneToE164('+8613800138000')).toBe('+8613800138000');
  });

  it('rejects invalid numbers', () => {
    expect(normalizePhoneToE164('12345')).toBeNull();
  });
});

describe('toDomesticPhoneNumber', () => {
  it('strips country code', () => {
    expect(toDomesticPhoneNumber('+8613800138000')).toBe('13800138000');
  });
});

describe('formatPhoneForDisplay', () => {
  it('formats with spaces', () => {
    expect(formatPhoneForDisplay('+8613800138000')).toBe('138 0013 8000');
  });
});

describe('assertSmsRateLimit', () => {
  afterEach(() => resetSmsRateLimits());

  it('allows first request', () => {
    expect(() => assertSmsRateLimit('+8613800138000', '1.2.3.4')).not.toThrow();
  });

  it('blocks rapid resend for same phone', () => {
    process.env.SMS_OTP_PER_PHONE_PER_MIN = '1';
    assertSmsRateLimit('+8613800138000', '1.2.3.4');
    expect(() => assertSmsRateLimit('+8613800138000', '1.2.3.4')).toThrow(SmsRateLimitError);
  });
});

describe('SMS_MOCK_VERIFY_CODE', () => {
  it('is six digits for dev mock', () => {
    expect(SMS_MOCK_VERIFY_CODE).toMatch(/^\d{6}$/);
  });
});
