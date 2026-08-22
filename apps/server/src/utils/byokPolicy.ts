import { TRPCError } from '@trpc/server';

/**
 * BYOK (bring-your-own-key) is allowed unless explicitly disabled.
 * Keep this aligned with billing (`chargeBeforeChat`) and admin.config.status.
 */
export const isByokAllowed = (): boolean => process.env.BYOK_ALLOWED !== 'false';

export const BYOK_WRITES_DISABLED_MESSAGE =
  'Bring-your-own-key is disabled. Platform model providers are configured by the administrator in Admin → 模型服务商 (or server environment variables).';

export const PLATFORM_AI_ADMIN_ONLY_MESSAGE =
  'AI provider and service model settings are managed by the administrator.';

export const PLATFORM_AI_SETTING_KEYS = ['defaultAgent', 'languageModel', 'systemAgent'] as const;

export type PlatformAiSettingKey = (typeof PLATFORM_AI_SETTING_KEYS)[number];

/**
 * Rejects mutations that persist user/workspace provider credentials when BYOK is off.
 */
export const assertByokWritesAllowed = (): void => {
  if (isByokAllowed()) return;

  throw new TRPCError({
    code: 'FORBIDDEN',
    message: BYOK_WRITES_DISABLED_MESSAGE,
  });
};

/**
 * When BYOK is disabled, only site admins may change platform AI defaults
 * (systemAgent / defaultAgent / languageModel).
 */
export const assertPlatformAiSettingsWritable = (role: string | null | undefined): void => {
  if (isByokAllowed()) return;
  if (role === 'admin') return;

  throw new TRPCError({
    code: 'FORBIDDEN',
    message: PLATFORM_AI_ADMIN_ONLY_MESSAGE,
  });
};

export const canWritePlatformAiSettings = (role: string | null | undefined): boolean =>
  isByokAllowed() || role === 'admin';

/**
 * Drop platform AI defaults from a settings patch.
 * Used when BYOK is off and the caller is not an admin, so unrelated fields
 * (e.g. onboarding `general.responseLanguage`) can still be persisted.
 */
export const omitPlatformAiSettings = <T extends Record<string, unknown>>(
  settings: T,
): Omit<T, PlatformAiSettingKey> => {
  const next = { ...settings };
  for (const key of PLATFORM_AI_SETTING_KEYS) {
    delete next[key];
  }
  return next as Omit<T, PlatformAiSettingKey>;
};
