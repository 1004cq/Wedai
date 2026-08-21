import {
  featureFlagsSelectors,
  serverConfigSelectors,
  useServerConfigStore,
} from '@/store/serverConfig';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/slices/auth/selectors';

/**
 * Commercial AI configuration visibility.
 *
 * - Provider menu follows `showProvider` (forced off when BYOK_ALLOWED=false).
 * - Service Model: under business + BYOK lock, only site admins may open it;
 *   OSS / BYOK-enabled builds keep the existing open behavior.
 */
export const usePlatformAiSettingsAccess = () => {
  const { showProvider } = useServerConfigStore(featureFlagsSelectors);
  const enableBusinessFeatures = useServerConfigStore(serverConfigSelectors.enableBusinessFeatures);
  const role = useUserStore((s) => userProfileSelectors.role(s));
  const isAdmin = role === 'admin';

  const platformAiLocked = enableBusinessFeatures && !showProvider;
  const showServiceModel = !platformAiLocked || isAdmin;

  return {
    isAdmin,
    platformAiLocked,
    showProvider,
    showServiceModel,
  };
};
