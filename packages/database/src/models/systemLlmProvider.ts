import { eq } from 'drizzle-orm';

import type { NewSystemLlmProvider, SystemLlmProviderItem } from '../schemas';
import { systemLlmProviders } from '../schemas';
import type { LobeChatDatabase } from '../type';

interface GateKeeper {
  decrypt: (ciphertext: string) => Promise<{ plaintext: string }>;
  encrypt: (plaintext: string) => Promise<string>;
}

export type SystemLlmCredentials = {
  accessKeyId?: string;
  apiKey?: string;
  baseURL?: string;
  region?: string;
  secretAccessKey?: string;
  sessionToken?: string;
};

export interface DecryptedSystemLlmProvider extends Omit<SystemLlmProviderItem, 'credentials'> {
  credentials: SystemLlmCredentials;
}

interface UpsertParams {
  credentials: SystemLlmCredentials;
  enabled?: boolean;
  provider: string;
}

interface UpdateParams {
  /** Pass `undefined` to leave existing ciphertext untouched. */
  credentials?: SystemLlmCredentials;
  enabled?: boolean;
}

/**
 * Static-method-style model for `system_llm_providers`.
 *
 * System-wide (no per-user scoping). Credentials are encrypted with the same
 * `KeyVaultsGateKeeper` used for user key vaults and system bot providers.
 */
export class SystemLlmProviderModel {
  static findByProvider = async (
    db: LobeChatDatabase,
    provider: string,
    gateKeeper?: GateKeeper,
  ): Promise<DecryptedSystemLlmProvider | null> => {
    const [result] = await db
      .select()
      .from(systemLlmProviders)
      .where(eq(systemLlmProviders.provider, provider))
      .limit(1);

    if (!result) return null;
    return decryptRow(result, gateKeeper);
  };

  static findEnabledByProvider = async (
    db: LobeChatDatabase,
    provider: string,
    gateKeeper?: GateKeeper,
  ): Promise<DecryptedSystemLlmProvider | null> => {
    const row = await SystemLlmProviderModel.findByProvider(db, provider, gateKeeper);
    if (!row || !row.enabled) return null;
    return row;
  };

  static listAll = async (
    db: LobeChatDatabase,
    gateKeeper?: GateKeeper,
  ): Promise<DecryptedSystemLlmProvider[]> => {
    const rows = await db.select().from(systemLlmProviders);
    return Promise.all(rows.map((r) => decryptRow(r, gateKeeper)));
  };

  /**
   * Provider ids that have a usable platform secret (enabled + non-empty
   * apiKey or Bedrock access key pair). Used to flip `enabled` in global AI
   * provider config under business mode.
   */
  static listConfiguredProviderIds = async (
    db: LobeChatDatabase,
    gateKeeper?: GateKeeper,
  ): Promise<string[]> => {
    const rows = await SystemLlmProviderModel.listAll(db, gateKeeper);
    return rows
      .filter((row) => row.enabled && hasUsableCredentials(row.credentials))
      .map((row) => row.provider);
  };

  static upsertByProvider = async (
    db: LobeChatDatabase,
    params: UpsertParams,
    gateKeeper?: GateKeeper,
  ): Promise<SystemLlmProviderItem> => {
    const credentialsCipher = await encryptCredentials(params.credentials, gateKeeper);

    const insertValue: NewSystemLlmProvider = {
      credentials: credentialsCipher,
      enabled: params.enabled ?? true,
      provider: params.provider,
    };

    const [result] = await db
      .insert(systemLlmProviders)
      .values(insertValue)
      .onConflictDoUpdate({
        set: {
          credentials: insertValue.credentials,
          enabled: insertValue.enabled,
          updatedAt: new Date(),
        },
        target: systemLlmProviders.provider,
      })
      .returning();
    return result;
  };

  /**
   * Partial update by provider id. Omitting `credentials` leaves ciphertext alone.
   * Creates a disabled empty row when updating enabled on a missing provider.
   */
  static updateByProvider = async (
    db: LobeChatDatabase,
    provider: string,
    params: UpdateParams,
    gateKeeper?: GateKeeper,
  ): Promise<SystemLlmProviderItem> => {
    const existing = await SystemLlmProviderModel.findByProvider(db, provider);

    if (!existing) {
      return SystemLlmProviderModel.upsertByProvider(
        db,
        {
          credentials: params.credentials ?? {},
          enabled: params.enabled ?? true,
          provider,
        },
        gateKeeper,
      );
    }

    const updateValue: Partial<SystemLlmProviderItem> = {
      updatedAt: new Date(),
    };
    if (params.enabled !== undefined) updateValue.enabled = params.enabled;
    if (params.credentials !== undefined) {
      updateValue.credentials = await encryptCredentials(params.credentials, gateKeeper);
    }

    const [updated] = await db
      .update(systemLlmProviders)
      .set(updateValue)
      .where(eq(systemLlmProviders.provider, provider))
      .returning();
    return updated;
  };

  static deleteByProvider = async (db: LobeChatDatabase, provider: string): Promise<void> => {
    await db.delete(systemLlmProviders).where(eq(systemLlmProviders.provider, provider));
  };
}

export const hasUsableCredentials = (credentials: SystemLlmCredentials): boolean => {
  if (typeof credentials.apiKey === 'string' && credentials.apiKey.trim().length > 0) return true;
  if (
    typeof credentials.accessKeyId === 'string' &&
    credentials.accessKeyId.trim().length > 0 &&
    typeof credentials.secretAccessKey === 'string' &&
    credentials.secretAccessKey.trim().length > 0
  ) {
    return true;
  }
  return false;
};

async function encryptCredentials(
  credentials: SystemLlmCredentials,
  gateKeeper?: GateKeeper,
): Promise<string> {
  const json = JSON.stringify(credentials);
  if (!gateKeeper) return json;
  return gateKeeper.encrypt(json);
}

async function decryptRow(
  row: SystemLlmProviderItem,
  gateKeeper?: GateKeeper,
): Promise<DecryptedSystemLlmProvider> {
  if (!row.credentials) return { ...row, credentials: {} };

  try {
    const credentials = gateKeeper
      ? JSON.parse((await gateKeeper.decrypt(row.credentials)).plaintext)
      : JSON.parse(row.credentials);
    return { ...row, credentials: credentials ?? {} };
  } catch {
    return { ...row, credentials: {} };
  }
}
