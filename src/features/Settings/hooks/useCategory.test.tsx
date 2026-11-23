import { cleanup, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mapFeatureFlagsEnvToState } from '@/config/featureFlags';
import { SettingsTabs } from '@/store/global/initialState';
import { initServerConfigStore, Provider } from '@/store/serverConfig/store';
import { useUserStore } from '@/store/user';

import { SettingsGroupKey, useCategory } from './useCategory';

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
          serverConfig: { aiProvider: {}, enableBusinessFeatures, telemetry: {} },
          featureFlags: {
            ...mapFeatureFlagsEnvToState({
              provider_settings: true,
            }),
            showProvider,
          },
        })
      }
    >
      {children}
    </Provider>
  );

  return Wrapper;
};

const getItemKeys = () => {
  const { result } = renderHook(() => useCategory(), {
    wrapper: createWrapper(true),
  });

  return result.current.flatMap((group) => group.items.map((item) => item.key));
};

const initialUserStoreState = useUserStore.getState();

afterEach(() => {
  cleanup();
  useUserStore.setState(initialUserStoreState, true);
});

describe('settings useCategory', () => {
  it('orders Wedai commercial groups with subscription under general', () => {
    const { result } = renderHook(() => useCategory(), {
      wrapper: createWrapper(true, true),
    });

    const groupKeys = (key: SettingsGroupKey) =>
      result.current.find((group) => group.key === key)?.items.map((item) => item.key);

    expect(result.current.map((group) => group.key)).toEqual([
      SettingsGroupKey.General,
      SettingsGroupKey.Subscription,
      SettingsGroupKey.Agent,
      SettingsGroupKey.System,
      SettingsGroupKey.Developer,
    ]);

    expect(groupKeys(SettingsGroupKey.General)).toEqual([
      SettingsTabs.Profile,
      SettingsTabs.Stats,
      SettingsTabs.Appearance,
      SettingsTabs.Devices,
      SettingsTabs.Hotkey,
      SettingsTabs.Notification,
    ]);

    expect(groupKeys(SettingsGroupKey.Subscription)).toEqual([
      SettingsTabs.Plans,
      SettingsTabs.Usage,
      SettingsTabs.Credits,
      SettingsTabs.Billing,
    ]);

    const agentKeys = groupKeys(SettingsGroupKey.Agent);
    expect(agentKeys).toContain(SettingsTabs.Skill);
    expect(agentKeys).toContain(SettingsTabs.Connector);
    expect(agentKeys).toContain(SettingsTabs.Messenger);
  });

  it('keeps Provider and hides OAuth Apps by default', () => {
    const keys = getItemKeys();

    expect(keys).toContain(SettingsTabs.Provider);
    expect(keys).not.toContain(SettingsTabs.OAuthApps);
  });

  it('hides Provider when provider settings are disabled', () => {
    const { result } = renderHook(() => useCategory(), {
      wrapper: createWrapper(false),
    });

    const keys = result.current.flatMap((group) => group.items.map((item) => item.key));

    expect(keys).not.toContain(SettingsTabs.Provider);
  });

  const renderWithApiKeyFlag = (showApiKeyManage: boolean) =>
    renderHook(() => useCategory(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <Provider
          createStore={() =>
            initServerConfigStore({
              featureFlags: { ...mapFeatureFlagsEnvToState({}), showApiKeyManage },
              serverConfig: { aiProvider: {}, telemetry: {} },
            })
          }
        >
          {children}
        </Provider>
      ),
    }).result.current.flatMap((group) => group.items.map((item) => item.key));

  it('lists API Key once when the deployment enables it', () => {
    expect(renderWithApiKeyFlag(true).filter((key) => key === SettingsTabs.APIKey)).toHaveLength(1);
  });

  // Wedai also surfaces API Key under Developer when isDevMode is on.
  it('lists API Key in Developer when isDevMode is on even if the flag is off', () => {
    useUserStore.setState({
      settings: { general: { isDevMode: true } },
    } as unknown as Parameters<typeof useUserStore.setState>[0]);

    expect(renderWithApiKeyFlag(false)).toContain(SettingsTabs.APIKey);
  });

  it('always lists Advanced under Developer on Wedai', () => {
    const keys = getItemKeys();
    expect(keys).toContain(SettingsTabs.Advanced);
  });

  it('shows OAuth Apps in Developer when the Labs preference is enabled', () => {
    useUserStore.setState({
      preference: {
        ...initialUserStoreState.preference,
        lab: { ...initialUserStoreState.preference.lab, enableOAuthApps: true },
      },
    });

    const { result } = renderHook(() => useCategory(), {
      wrapper: createWrapper(true),
    });
    const developerGroup = result.current.find((group) => group.key === SettingsGroupKey.Developer);

    expect(developerGroup?.items.map((item) => item.key)).toContain(SettingsTabs.OAuthApps);
  });
});
