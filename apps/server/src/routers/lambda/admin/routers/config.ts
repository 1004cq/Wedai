/**
 * admin.config — system configuration status + SMS settings (masked).
 *
 * SECURITY CONTRACT (P3-1):
 *  - Secret values are NEVER returned — only boolean `configured` or masked id.
 *  - accessKeySecret is write-only; empty string on update means "keep existing".
 */
import { z } from 'zod';

import { SystemSmsConfigModel } from '@/database/models/systemSmsConfig';
import { router } from '@/libs/trpc/lambda';
import { getAdminSmsConfigView, getSmsConfig, isSmsOperational } from '@/server/services/sms';

import { adminProcedure } from '../middleware';

/** Returns true if the env var is set to a non-empty string. */
const isSet = (name: string): boolean => {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
};

const maskId = (name: string): string | null => {
  const v = process.env[name];
  if (!v || v.trim().length === 0) return null;
  const trimmed = v.trim();
  return trimmed.length <= 4 ? '••••' : `••••${trimmed.slice(-4)}`;
};

const updateSmsSchema = z.object({
  accessKeyId: z.string().optional(),
  accessKeySecret: z.string().optional(),
  enablePhoneRegister: z.boolean().optional(),
  enabled: z.boolean().optional(),
  mock: z.boolean().optional(),
  provider: z.enum(['aliyun_pnvs', 'mock']).optional(),
  schemeName: z.string().nullable().optional(),
  signName: z.string().nullable().optional(),
  templateCode: z.string().nullable().optional(),
});

export const adminConfigRouter = router({
  status: adminProcedure.query(async () => {
    const smsView = await getAdminSmsConfigView();

    return {
      stripe: {
        enabled: isSet('STRIPE_SECRET_KEY') && isSet('STRIPE_WEBHOOK_SECRET'),
        publishableKeyConfigured: isSet('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'),
        secretKeyConfigured: isSet('STRIPE_SECRET_KEY'),
        webhookSecretConfigured: isSet('STRIPE_WEBHOOK_SECRET'),
      },
      email: {
        configured: isSet('SMTP_HOST') || isSet('RESEND_API_KEY'),
        provider: isSet('RESEND_API_KEY') ? 'resend' : isSet('SMTP_HOST') ? 'smtp' : null,
        smtpHost: maskId('SMTP_HOST'),
        fromEmail: maskId('SMTP_FROM') ?? maskId('RESEND_FROM'),
      },
      sms: {
        configured: smsView.configured,
      },
      billing: {
        byokAllowed: process.env.BYOK_ALLOWED !== 'false',
        byokGatewayFeeEnabled: process.env.BYOK_GATEWAY_FEE_ENABLED === 'true',
        signupCreditGrant: Number.parseInt(process.env.SIGNUP_CREDIT_GRANT ?? '0', 10) || 0,
      },
    };
  }),

  /** Full SMS settings for admin UI — secrets masked / boolean only. */
  smsSettings: adminProcedure.query(async () => getAdminSmsConfigView()),

  updateSms: adminProcedure.input(updateSmsSchema).mutation(async ({ ctx, input }) => {
    const model = new SystemSmsConfigModel(ctx.serverDB);
    await model.upsert({
      accessKeyId: input.accessKeyId,
      accessKeySecret: input.accessKeySecret,
      enablePhoneRegister: input.enablePhoneRegister,
      enabled: input.enabled,
      mock: input.mock,
      provider: input.provider,
      schemeName: input.schemeName,
      signName: input.signName,
      templateCode: input.templateCode,
    });

    const cfg = await getSmsConfig();
    return {
      configured: isSmsOperational(cfg),
      ...(await getAdminSmsConfigView()),
    };
  }),
});
