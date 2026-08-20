import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface ProcessEnv {
      ALIBABA_CLOUD_ACCESS_KEY_ID?: string;
      ALIBABA_CLOUD_ACCESS_KEY_SECRET?: string;
      ALIYUN_SMS_VERIFY_SIGN_NAME?: string;
      ALIYUN_SMS_VERIFY_TEMPLATE_CODE?: string;
      SMS_MOCK?: string;
      SMS_OTP_PER_IP_PER_MIN?: string;
      SMS_OTP_PER_PHONE_PER_MIN?: string;
      SMS_PROVIDER?: string;
    }
  }
}

export const getSmsEnv = () =>
  createEnv({
    client: {},
    clientPrefix: 'NEXT_PUBLIC_',
    runtimeEnv: {
      ALIBABA_CLOUD_ACCESS_KEY_ID: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
      ALIBABA_CLOUD_ACCESS_KEY_SECRET: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
      ALIYUN_SMS_VERIFY_SIGN_NAME: process.env.ALIYUN_SMS_VERIFY_SIGN_NAME,
      ALIYUN_SMS_VERIFY_TEMPLATE_CODE: process.env.ALIYUN_SMS_VERIFY_TEMPLATE_CODE,
      SMS_MOCK: process.env.SMS_MOCK === '1' || process.env.SMS_MOCK === 'true',
      SMS_OTP_PER_IP_PER_MIN: process.env.SMS_OTP_PER_IP_PER_MIN,
      SMS_OTP_PER_PHONE_PER_MIN: process.env.SMS_OTP_PER_PHONE_PER_MIN,
      SMS_PROVIDER: process.env.SMS_PROVIDER,
    },
    server: {
      ALIBABA_CLOUD_ACCESS_KEY_ID: z.string().optional(),
      ALIBABA_CLOUD_ACCESS_KEY_SECRET: z.string().optional(),
      ALIYUN_SMS_VERIFY_SIGN_NAME: z.string().optional(),
      ALIYUN_SMS_VERIFY_TEMPLATE_CODE: z.string().optional(),
      SMS_MOCK: z.boolean().optional().default(false),
      SMS_OTP_PER_IP_PER_MIN: z.coerce.number().int().min(1).optional().default(1),
      SMS_OTP_PER_PHONE_PER_MIN: z.coerce.number().int().min(1).optional().default(10),
      SMS_PROVIDER: z.enum(['aliyun_pnvs', 'mock']).optional(),
    },
  });

export const smsEnv = getSmsEnv();
