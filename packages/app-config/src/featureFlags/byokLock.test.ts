import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('getServerFeatureFlagsValue BYOK lock', () => {
  it('forces provider settings off when BYOK_ALLOWED=false', async () => {
    vi.stubEnv('BYOK_ALLOWED', 'false');
    vi.stubEnv('FEATURE_FLAGS', undefined);

    const { getServerFeatureFlagsValue, mapFeatureFlagsEnvToState } = await import('./index');
    const flags = getServerFeatureFlagsValue();
    const state = mapFeatureFlagsEnvToState(flags);

    expect(flags.provider_settings).toBe(false);
    expect(flags.openai_api_key).toBe(false);
    expect(flags.openai_proxy_url).toBe(false);
    expect(state.showProvider).toBe(false);
    expect(state.showOpenAIApiKey).toBe(false);
  });
});
