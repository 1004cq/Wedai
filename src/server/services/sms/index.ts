import { isSmsConfigured, smsEnv } from '@/envs/sms';

import { sendAliyunSms } from './providers/aliyun';
import { assertSmsRateLimit } from './rateLimit';

export { formatPhoneForDisplay, normalizePhoneToE164 } from './normalizePhone';
export { assertSmsRateLimit, resetSmsRateLimits, SmsRateLimitError } from './rateLimit';

const shouldMockSend = (): boolean => {
  if (process.env.NODE_ENV === 'production') return false;
  return smsEnv.SMS_MOCK || !isSmsConfigured();
};

const maskPhone = (phoneNumber: string): string => {
  const digits = phoneNumber.replaceAll(/\D/g, '');
  if (digits.length < 7) return '***';
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
};

export interface SendSmsParams {
  code: string;
  ip?: string | null;
  phoneNumber: string;
}

/**
 * Sends an OTP SMS via configured provider.
 * In non-production, falls back to server log when SMS_MOCK or credentials absent.
 */
export async function sendSms({ phoneNumber, code, ip }: SendSmsParams): Promise<void> {
  assertSmsRateLimit(phoneNumber, ip);

  if (shouldMockSend()) {
    console.info('[sms:mock] OTP for %s → %s (dev only, not sent)', maskPhone(phoneNumber), code);
    return;
  }

  if (!isSmsConfigured()) {
    console.error('[sms] credentials missing in production');
    throw new Error('SMS_NOT_CONFIGURED');
  }

  switch (smsEnv.SMS_PROVIDER) {
    case 'aliyun': {
      await sendAliyunSms({ code, phoneNumber });
      return;
    }
    default: {
      throw new Error('SMS_PROVIDER_NOT_SUPPORTED');
    }
  }
}
