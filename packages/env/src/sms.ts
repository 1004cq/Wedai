import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface ProcessEnv {
      SMS_ACCESS_KEY_ID?: string;
      SMS_ACCESS_KEY_SECRET?: string;
      SMS_MOCK?: string;
      SMS_OTP_PER_IP_PER_MIN?: string;
      SMS_OTP_PER_PHONE_PER_MIN?: string;
      SMS_PROVIDER?: string;
      SMS_SIGN_NAME?: string;
      SMS_TEMPLATE_CODE?: string;
    }
  }
}

export const getSmsConfig = () =>
  createEnv({
    client: {},
    clientPrefix: 'NEXT_PUBLIC_',
    runtimeEnv: {
      SMS_ACCESS_KEY_ID: process.env.SMS_ACCESS_KEY_ID,
      SMS_ACCESS_KEY_SECRET: process.env.SMS_ACCESS_KEY_SECRET,
      SMS_MOCK: process.env.SMS_MOCK === '1' || process.env.SMS_MOCK === 'true',
      SMS_OTP_PER_IP_PER_MIN: process.env.SMS_OTP_PER_IP_PER_MIN,
      SMS_OTP_PER_PHONE_PER_MIN: process.env.SMS_OTP_PER_PHONE_PER_MIN,
      SMS_PROVIDER: process.env.SMS_PROVIDER,
      SMS_SIGN_NAME: process.env.SMS_SIGN_NAME,
      SMS_TEMPLATE_CODE: process.env.SMS_TEMPLATE_CODE,
    },
    server: {
      /** Dev-only mock: log OTP instead of sending SMS. Never enable in production. */
      SMS_MOCK: z.boolean().optional().default(false),
      /** aliyun | tencent (extensible) */
      SMS_PROVIDER: z.enum(['aliyun', 'tencent']).optional(),
      SMS_ACCESS_KEY_ID: z.string().optional(),
      SMS_ACCESS_KEY_SECRET: z.string().optional(),
      SMS_SIGN_NAME: z.string().optional(),
      SMS_TEMPLATE_CODE: z.string().optional(),
      SMS_OTP_PER_PHONE_PER_MIN: z.coerce.number().int().min(1).optional().default(1),
      SMS_OTP_PER_IP_PER_MIN: z.coerce.number().int().min(1).optional().default(10),
    },
  });

export const smsEnv = getSmsConfig();

export const isSmsConfigured = (): boolean => {
  if (smsEnv.SMS_MOCK && process.env.NODE_ENV !== 'production') return true;
  return Boolean(
    smsEnv.SMS_PROVIDER &&
    smsEnv.SMS_ACCESS_KEY_ID &&
    smsEnv.SMS_ACCESS_KEY_SECRET &&
    smsEnv.SMS_SIGN_NAME &&
    smsEnv.SMS_TEMPLATE_CODE,
  );
};
