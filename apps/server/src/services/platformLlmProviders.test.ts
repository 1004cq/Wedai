import { describe, expect, it } from 'vitest';

import {
  mergeLlmCredentialUpdate,
  mergePlatformCredentialsIntoKeyVaults,
} from '../platformLlmProviders';

describe('mergeLlmCredentialUpdate', () => {
  it('skips empty secret fields and clears on clearSecrets', () => {
    const existing = {
      apiKey: 'keep',
      baseURL: 'https://a.example',
    };

    expect(
      mergeLlmCredentialUpdate(existing, { apiKey: '  ', baseURL: 'https://b.example' }),
    ).toEqual({
      apiKey: 'keep',
      baseURL: 'https://b.example',
    });

    expect(
      mergeLlmCredentialUpdate(
        existing,
        { apiKey: 'new-key', baseURL: '' },
        { clearSecrets: true },
      ),
    ).toEqual({
      baseURL: existing.baseURL,
      region: undefined,
    });

    expect(mergeLlmCredentialUpdate(existing, { apiKey: 'new-key' })).toEqual({
      apiKey: 'new-key',
      baseURL: 'https://a.example',
    });
  });
});

describe('mergePlatformCredentialsIntoKeyVaults', () => {
  it('only fills missing keyVault fields', () => {
    expect(
      mergePlatformCredentialsIntoKeyVaults(
        { apiKey: 'user-key', baseURL: undefined },
        { apiKey: 'platform', baseURL: 'https://platform' },
      ),
    ).toEqual({ apiKey: 'user-key', baseURL: 'https://platform' });
  });
});
