import { smsEnv } from '@/envs/sms';
import { toDomesticPhoneNumber } from '@/libs/phone/normalizePhone';

import { getSmsConfig, isSmsOperational, toPnvsCredentials } from './config';
import { checkSmsVerifyCode, sendSmsVerifyCode } from './providers/aliyunPnvs';
import { assertSmsRateLimit, SMS_MOCK_VERIFY_CODE } from './rateLimit';

export { getAdminSmsConfigView, getSmsConfig, isSmsOperational } from './config';
export {
  assertSmsRateLimit,
  resetSmsRateLimits,
  SMS_MOCK_VERIFY_CODE,
  SmsRateLimitError,
} from './rateLimit';
export {
  formatPhoneForDisplay,
  normalizePhoneToE164,
  toDomesticPhoneNumber,
} from '@/libs/phone/normalizePhone';

const maskPhone = (phoneNumber: string): string => {
  const digits = phoneNumber.replaceAll(/\D/g, '');
  if (digits.length < 7) return '***';
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
};

const shouldUseMock = async (): Promise<boolean> => {
  if (process.env.NODE_ENV === 'production') return false;

  const cfg = await getSmsConfig();
  if (cfg.mock || cfg.provider === 'mock' || smsEnv.SMS_MOCK) return true;

  return !isSmsOperational({ ...cfg, mock: false });
};

/**
 * Sends OTP via Aliyun PNVS SendSmsVerifyCode.
 * Mock: logs success; verification accepts {@link SMS_MOCK_VERIFY_CODE} only.
 */
export async function sendVerifyCode(phoneE164: string, ip?: string | null): Promise<void> {
  const domestic = toDomesticPhoneNumber(phoneE164);
  if (!domestic) throw new Error('INVALID_PHONE_NUMBER');

  const cfg = await getSmsConfig();
  if (!cfg.enabled) throw new Error('SMS_DISABLED');
  if (!cfg.enablePhoneRegister && process.env.NODE_ENV === 'production') {
    throw new Error('SMS_PHONE_REGISTER_DISABLED');
  }

  assertSmsRateLimit(phoneE164, ip);

  if (await shouldUseMock()) {
    console.info(
      '[sms:mock] SendSmsVerifyCode skipped for %s — use verify code %s (dev only)',
      maskPhone(phoneE164),
      SMS_MOCK_VERIFY_CODE,
    );
    return;
  }

  const creds = toPnvsCredentials(cfg);
  if (!creds) {
    console.error('[sms:pnvs] credentials missing in production');
    throw new Error('SMS_NOT_CONFIGURED');
  }

  await sendSmsVerifyCode(creds, domestic);
}

/**
 * Verifies OTP via Aliyun PNVS CheckSmsVerifyCode (or mock fixed code).
 */
export async function checkVerifyCode(phoneE164: string, code: string): Promise<boolean> {
  const domestic = toDomesticPhoneNumber(phoneE164);
  if (!domestic) return false;

  if (await shouldUseMock()) {
    return code.trim() === SMS_MOCK_VERIFY_CODE;
  }

  const cfg = await getSmsConfig();
  const creds = toPnvsCredentials(cfg);
  if (!creds) return false;

  return checkSmsVerifyCode(creds, domestic, code.trim());
}
