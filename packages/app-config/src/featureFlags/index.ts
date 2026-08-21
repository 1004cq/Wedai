import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

import { merge } from '@/utils/merge';

import { DEFAULT_FEATURE_FLAGS, mapFeatureFlagsEnvToState } from './schema';
import { parseFeatureFlag } from './utils/parser';

const env = createEnv({
  runtimeEnv: {
    FEATURE_FLAGS: process.env.FEATURE_FLAGS,
  },

  server: {
    FEATURE_FLAGS: z.string().optional(),
  },
});

/**
 * Only the flags explicitly configured via the FEATURE_FLAGS env var,
 * without schema defaults merged in.
 */
export const getExplicitServerFeatureFlags = () => parseFeatureFlag(env.FEATURE_FLAGS);

export const getServerFeatureFlagsValue = () => {
  const flags = parseFeatureFlag(env.FEATURE_FLAGS);

  const result = merge(DEFAULT_FEATURE_FLAGS, flags);

  // Align with server runtime: BYOK off hides provider / key settings for all users.
  if (process.env.BYOK_ALLOWED === 'false') {
    return {
      ...result,
      openai_api_key: false,
      openai_proxy_url: false,
      provider_settings: false,
    };
  }

  return result;
};

export const serverFeatureFlags = (userId?: string) => {
  const serverConfig = getServerFeatureFlagsValue();

  return mapFeatureFlagsEnvToState(serverConfig, userId);
};

export * from './schema';
