// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mapFeatureFlagsEnvToState } from '@/config/featureFlags';
import { initServerConfigStore, Provider } from '@/store/serverConfig/store';
import { useUserStore } from '@/store/user';

import { usePlatformAiSettingsAccess } from './usePlatformAiSettingsAccess';

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn(() => null),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    },
  });
});

const createWrapper = (showProvider: boolean, enableBusinessFeatures = false) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Provider
      createStore={() =>
        initServerConfigStore({
          featureFlags: {
            ...mapFeatureFlagsEnvToState({
              provider_settings: true,
            }),
            showProvider,
          },
          serverConfig: {
            aiProvider: {},
            enableBusinessFeatures,
            telemetry: {},
          },
        })
      }
    >
      {children}
    </Provider>
  );

  return Wrapper;
};

const initialUserStoreState = useUserStore.getState();

afterEach(() => {
  cleanup();
  useUserStore.setState(initialUserStoreState, true);
});

describe('usePlatformAiSettingsAccess', () => {
  it('hides Service Model for admins when commercial BYOK is locked', () => {
    useUserStore.setState({
      user: { id: 'admin-1', role: 'admin' },
    } as any);

    const { result } = renderHook(() => usePlatformAiSettingsAccess(), {
      wrapper: createWrapper(false, true),
    });

    expect(result.current.platformAiLocked).toBe(true);
    expect(result.current.showProvider).toBe(false);
    expect(result.current.showServiceModel).toBe(false);
    expect(result.current.isAdmin).toBe(true);
  });

  it('keeps Service Model visible when BYOK is not locked', () => {
    const { result } = renderHook(() => usePlatformAiSettingsAccess(), {
      wrapper: createWrapper(true, true),
    });

    expect(result.current.platformAiLocked).toBe(false);
    expect(result.current.showServiceModel).toBe(true);
  });
});
