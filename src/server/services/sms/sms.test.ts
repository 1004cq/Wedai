import { describe, expect, it } from 'vitest';

import { formatPhoneForDisplay, normalizePhoneToE164 } from '@/server/services/sms/normalizePhone';
import {
  assertSmsRateLimit,
  resetSmsRateLimits,
  SmsRateLimitError,
} from '@/server/services/sms/rateLimit';

describe('normalizePhoneToE164', () => {
  it('accepts 11-digit domestic number', () => {
    expect(normalizePhoneToE164('13800138000')).toBe('+8613800138000');
  });

  it('accepts +86 prefix', () => {
    expect(normalizePhoneToE164('+8613800138000')).toBe('+8613800138000');
  });

  it('accepts 86 prefix without plus', () => {
    expect(normalizePhoneToE164('8613800138000')).toBe('+8613800138000');
  });

  it('rejects invalid numbers', () => {
    expect(normalizePhoneToE164('12345')).toBeNull();
    expect(normalizePhoneToE164('23800138000')).toBeNull();
  });
});

describe('formatPhoneForDisplay', () => {
  it('formats E.164 to grouped domestic', () => {
    expect(formatPhoneForDisplay('+8613800138000')).toBe('138 0013 8000');
  });
});

describe('assertSmsRateLimit', () => {
  it('allows first request and blocks when exceeding phone limit', () => {
    resetSmsRateLimits();
    const phone = '+8613800138000';
    expect(() => assertSmsRateLimit(phone, '1.2.3.4')).not.toThrow();
    expect(() => assertSmsRateLimit(phone, '1.2.3.4')).toThrow(SmsRateLimitError);
  });
});
