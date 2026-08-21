import { TRPCError } from '@trpc/server';

/**
 * BYOK (bring-your-own-key) is allowed unless explicitly disabled.
 * Keep this aligned with billing (`chargeBeforeChat`) and admin.config.status.
 */
export const isByokAllowed = (): boolean => process.env.BYOK_ALLOWED !== 'false';

export const BYOK_WRITES_DISABLED_MESSAGE =
  'Bring-your-own-key is disabled. Platform model providers are configured by the administrator via server environment variables.';

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
