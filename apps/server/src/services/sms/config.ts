import { serverDB } from '@lobechat/database';

import { SystemSmsConfigModel } from '@/database/models/systemSmsConfig';
import { smsEnv } from '@/envs/sms';

export type SmsProvider = 'aliyun_pnvs' | 'mock';

/** Resolved runtime SMS config (DB overrides env for non-secret fields; secrets merged). */
export interface ResolvedSmsConfig {
  accessKeyId: string | null;
  accessKeySecret: string | null;
  enabled: boolean;
  enablePhoneRegister: boolean;
  mock: boolean;
  provider: SmsProvider;
  schemeName: string | null;
  signName: string | null;
  templateCode: string | null;
}

export interface AdminSmsConfigView {
  accessKeyIdConfigured: boolean;
  accessKeyIdMasked: string | null;
  accessKeySecretConfigured: boolean;
  configured: boolean;
  enabled: boolean;
  enablePhoneRegister: boolean;
  mock: boolean;
  provider: SmsProvider;
  schemeName: string | null;
  signName: string | null;
  templateCode: string | null;
}

const pickString = (...values: Array<string | null | undefined>): string | null => {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
};

const resolveProvider = (dbProvider?: string | null, envProvider?: string | null): SmsProvider => {
  const raw = pickString(dbProvider, envProvider);
  if (raw === 'aliyun_pnvs') return 'aliyun_pnvs';
  return 'mock';
};

export const isSmsOperational = (cfg: ResolvedSmsConfig): boolean => {
  if (!cfg.enabled) return false;
  if (cfg.mock || cfg.provider === 'mock') {
    return process.env.NODE_ENV !== 'production' || smsEnv.SMS_MOCK;
  }
  return Boolean(cfg.accessKeyId && cfg.accessKeySecret && cfg.signName && cfg.templateCode);
};

export async function getSmsConfig(): Promise<ResolvedSmsConfig> {
  const model = new SystemSmsConfigModel(serverDB);
  const row = await model.get();

  const provider = resolveProvider(row?.provider, smsEnv.SMS_PROVIDER ?? null);
  const mockFromEnv = smsEnv.SMS_MOCK && process.env.NODE_ENV !== 'production';

  return {
    enabled: row?.enabled ?? Boolean(smsEnv.SMS_PROVIDER || mockFromEnv),
    provider: mockFromEnv ? 'mock' : provider,
    mock: row?.mock ?? mockFromEnv ?? provider === 'mock',
    accessKeyId: pickString(row?.accessKeyId, smsEnv.ALIBABA_CLOUD_ACCESS_KEY_ID),
    accessKeySecret: pickString(row?.accessKeySecret, smsEnv.ALIBABA_CLOUD_ACCESS_KEY_SECRET),
    signName: pickString(row?.signName, smsEnv.ALIYUN_SMS_VERIFY_SIGN_NAME),
    templateCode: pickString(row?.templateCode, smsEnv.ALIYUN_SMS_VERIFY_TEMPLATE_CODE),
    schemeName: pickString(row?.schemeName),
    enablePhoneRegister: row?.enablePhoneRegister ?? true,
  };
}

export async function getAdminSmsConfigView(): Promise<AdminSmsConfigView> {
  const cfg = await getSmsConfig();
  const masked = cfg.accessKeyId
    ? cfg.accessKeyId.length <= 4
      ? '••••'
      : `••••${cfg.accessKeyId.slice(-4)}`
    : null;

  return {
    accessKeyIdConfigured: Boolean(cfg.accessKeyId),
    accessKeyIdMasked: masked,
    accessKeySecretConfigured: Boolean(cfg.accessKeySecret),
    configured: isSmsOperational(cfg),
    enablePhoneRegister: cfg.enablePhoneRegister,
    enabled: cfg.enabled,
    mock: cfg.mock,
    provider: cfg.provider,
    schemeName: cfg.schemeName,
    signName: cfg.signName,
    templateCode: cfg.templateCode,
  };
}

export const toPnvsCredentials = (cfg: ResolvedSmsConfig) => {
  if (!cfg.accessKeyId || !cfg.accessKeySecret || !cfg.signName || !cfg.templateCode) {
    return null;
  }
  return {
    accessKeyId: cfg.accessKeyId,
    accessKeySecret: cfg.accessKeySecret,
    schemeName: cfg.schemeName,
    signName: cfg.signName,
    templateCode: cfg.templateCode,
  };
};
