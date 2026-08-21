import {
  hasUsableCredentials,
  type SystemLlmCredentials,
  SystemLlmProviderModel,
} from '@/database/models/systemLlmProvider';
import type { LobeChatDatabase } from '@/database/type';
import { LLM_PROVIDER_STATUS } from '@/server/const/adminLlmProviders';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';
import type { ProviderConfig } from '@/types/user/settings';

const isNonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** Env-var configured check aligned with admin LLM_PROVIDER_STATUS. */
export const isProviderEnvConfigured = (
  providerId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean => {
  const meta = LLM_PROVIDER_STATUS.find((p) => p.id === providerId);
  if (!meta) return false;
  const v = env[meta.envKey];
  return typeof v === 'string' && v.trim().length > 0;
};

/**
 * Enable providers that have a platform key (env or DB) so business mode is
 * not stuck on lobehub-only when self-hosting with admin-managed secrets.
 */
export const applyPlatformLlmProviderEnables = async (
  aiProvider: Record<string, ProviderConfig>,
  db: LobeChatDatabase,
): Promise<Record<string, ProviderConfig>> => {
  let dbConfiguredIds: string[];
  try {
    const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
    dbConfiguredIds = await SystemLlmProviderModel.listConfiguredProviderIds(db, gateKeeper);
  } catch {
    // KEY_VAULTS_SECRET missing / decrypt failure — still apply env enables.
    dbConfiguredIds = [];
  }

  const enabledIds = new Set<string>([
    ...dbConfiguredIds,
    ...LLM_PROVIDER_STATUS.filter((p) => isProviderEnvConfigured(p.id)).map((p) => p.id),
  ]);

  if (enabledIds.size === 0) return aiProvider;

  const next: Record<string, ProviderConfig> = { ...aiProvider };
  for (const id of enabledIds) {
    if (!next[id]) continue;
    next[id] = { ...next[id], enabled: true };
  }
  return next;
};

/**
 * Resolve platform credentials for a provider: DB (enabled) first, else empty.
 * Env fallback remains in ModelRuntime.getParamsFromPayload.
 */
export const resolvePlatformLlmCredentials = async (
  db: LobeChatDatabase,
  provider: string,
): Promise<SystemLlmCredentials | null> => {
  try {
    const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
    const row = await SystemLlmProviderModel.findEnabledByProvider(db, provider, gateKeeper);
    if (!row || !hasUsableCredentials(row.credentials)) return null;
    return row.credentials;
  } catch {
    return null;
  }
};

/**
 * Merge platform credentials into user keyVaults only for missing secret fields.
 */
export const mergePlatformCredentialsIntoKeyVaults = <T extends Record<string, unknown>>(
  keyVaults: T,
  platform: SystemLlmCredentials,
): T => {
  const next = { ...keyVaults } as Record<string, unknown>;

  if (!isNonEmpty(next.apiKey) && isNonEmpty(platform.apiKey)) {
    next.apiKey = platform.apiKey;
  }
  if (!isNonEmpty(next.baseURL) && isNonEmpty(platform.baseURL)) {
    next.baseURL = platform.baseURL;
  }
  if (!isNonEmpty(next.accessKeyId) && isNonEmpty(platform.accessKeyId)) {
    next.accessKeyId = platform.accessKeyId;
  }
  if (!isNonEmpty(next.secretAccessKey) && isNonEmpty(platform.secretAccessKey)) {
    next.secretAccessKey = platform.secretAccessKey;
  }
  if (!isNonEmpty(next.region) && isNonEmpty(platform.region)) {
    next.region = platform.region;
  }
  if (!isNonEmpty(next.sessionToken) && isNonEmpty(platform.sessionToken)) {
    next.sessionToken = platform.sessionToken;
  }

  return next as T;
};

/**
 * Empty-skip merge for admin updates: blank strings do not overwrite secrets.
 */
export const mergeLlmCredentialUpdate = (
  existing: SystemLlmCredentials,
  patch: SystemLlmCredentials,
  options?: { clearSecrets?: boolean },
): SystemLlmCredentials => {
  if (options?.clearSecrets) {
    return {
      baseURL: isNonEmpty(patch.baseURL) ? patch.baseURL.trim() : existing.baseURL,
      region: isNonEmpty(patch.region) ? patch.region.trim() : existing.region,
    };
  }

  const next: SystemLlmCredentials = { ...existing };

  if (isNonEmpty(patch.apiKey)) next.apiKey = patch.apiKey.trim();
  if (patch.baseURL !== undefined) {
    next.baseURL = isNonEmpty(patch.baseURL) ? patch.baseURL.trim() : undefined;
  }
  if (isNonEmpty(patch.accessKeyId)) next.accessKeyId = patch.accessKeyId.trim();
  if (isNonEmpty(patch.secretAccessKey)) next.secretAccessKey = patch.secretAccessKey.trim();
  if (patch.region !== undefined) {
    next.region = isNonEmpty(patch.region) ? patch.region.trim() : undefined;
  }
  if (isNonEmpty(patch.sessionToken)) next.sessionToken = patch.sessionToken.trim();

  return next;
};
