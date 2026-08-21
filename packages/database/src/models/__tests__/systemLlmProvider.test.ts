// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { systemLlmProviders } from '../../schemas';
import type { LobeChatDatabase } from '../../type';
import { hasUsableCredentials, SystemLlmProviderModel } from '../systemLlmProvider';

const serverDB: LobeChatDatabase = await getTestDB();

const mockGateKeeper = {
  decrypt: vi.fn(async (ciphertext: string) => ({ plaintext: ciphertext })),
  encrypt: vi.fn(async (plaintext: string) => plaintext),
};

beforeEach(async () => {
  await serverDB.delete(systemLlmProviders);
});

afterEach(async () => {
  await serverDB.delete(systemLlmProviders);
  vi.clearAllMocks();
});

describe('hasUsableCredentials', () => {
  it('accepts apiKey or bedrock key pair', () => {
    expect(hasUsableCredentials({ apiKey: 'sk-1' })).toBe(true);
    expect(hasUsableCredentials({ accessKeyId: 'a', secretAccessKey: 'b' })).toBe(true);
    expect(hasUsableCredentials({ accessKeyId: 'a' })).toBe(false);
    expect(hasUsableCredentials({})).toBe(false);
  });
});

describe('SystemLlmProviderModel', () => {
  it('upserts encrypted credentials and round-trips them', async () => {
    const created = await SystemLlmProviderModel.upsertByProvider(
      serverDB,
      {
        credentials: { apiKey: 'sk-test', baseURL: 'https://api.openai.com/v1' },
        provider: 'openai',
      },
      mockGateKeeper,
    );

    expect(created.provider).toBe('openai');
    expect(mockGateKeeper.encrypt).toHaveBeenCalledWith(
      JSON.stringify({ apiKey: 'sk-test', baseURL: 'https://api.openai.com/v1' }),
    );

    const found = await SystemLlmProviderModel.findEnabledByProvider(
      serverDB,
      'openai',
      mockGateKeeper,
    );
    expect(found?.credentials).toEqual({
      apiKey: 'sk-test',
      baseURL: 'https://api.openai.com/v1',
    });
  });

  it('overwrites credentials on second upsert', async () => {
    await SystemLlmProviderModel.upsertByProvider(serverDB, {
      credentials: { apiKey: 'old' },
      provider: 'anthropic',
    });
    await SystemLlmProviderModel.upsertByProvider(serverDB, {
      credentials: { apiKey: 'new' },
      provider: 'anthropic',
    });

    const found = await SystemLlmProviderModel.findByProvider(serverDB, 'anthropic');
    expect(found?.credentials).toEqual({ apiKey: 'new' });
  });

  it('ignores disabled rows in findEnabledByProvider', async () => {
    await SystemLlmProviderModel.upsertByProvider(serverDB, {
      credentials: { apiKey: 'sk' },
      enabled: false,
      provider: 'google',
    });

    expect(await SystemLlmProviderModel.findEnabledByProvider(serverDB, 'google')).toBeNull();
  });

  it('lists configured provider ids only when usable', async () => {
    await SystemLlmProviderModel.upsertByProvider(serverDB, {
      credentials: { apiKey: 'sk' },
      provider: 'openai',
    });
    await SystemLlmProviderModel.upsertByProvider(serverDB, {
      credentials: {},
      provider: 'anthropic',
    });
    await SystemLlmProviderModel.upsertByProvider(serverDB, {
      credentials: { apiKey: 'sk' },
      enabled: false,
      provider: 'deepseek',
    });

    const ids = await SystemLlmProviderModel.listConfiguredProviderIds(serverDB);
    expect(ids).toEqual(['openai']);
  });

  it('updateByProvider leaves credentials alone when omitted', async () => {
    await SystemLlmProviderModel.upsertByProvider(serverDB, {
      credentials: { apiKey: 'keep-me' },
      provider: 'qwen',
    });

    await SystemLlmProviderModel.updateByProvider(serverDB, 'qwen', { enabled: false });

    const found = await SystemLlmProviderModel.findByProvider(serverDB, 'qwen');
    expect(found?.enabled).toBe(false);
    expect(found?.credentials).toEqual({ apiKey: 'keep-me' });
  });
});
