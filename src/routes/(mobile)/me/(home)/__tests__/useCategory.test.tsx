import { act, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mapFeatureFlagsEnvToState } from '@/config/featureFlags';
import { SettingsTabs } from '@/store/global/initialState';
import { initServerConfigStore, Provider } from '@/store/serverConfig/store';
import { useUserStore } from '@/store/user';

import { SettingsGroupKey } from '../../settings/features/useCategory';
import { MeGroupKey, useCategory } from '../features/useCategory';

const navigate = vi.fn();

vi.mock('react-router', () => ({
  useNavigate: () => navigate,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/components/ChangelogModal', () => ({
  openChangelogModal: vi.fn(),
}));

const createWrapper = (enableBusinessFeatures = true) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Provider
      createStore={() =>
        initServerConfigStore({
          featureFlags: {
            ...mapFeatureFlagsEnvToState({
              provider_settings: true,
            }),
            hideDocs: false,
            showProvider: true,
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
  navigate.mockReset();
  useUserStore.setState(initialUserStoreState, true);
});

const flattenKeys = (groups: ReturnType<typeof useCategory>) =>
  groups.flatMap((group) => group.items.map((item) => item.key));

describe('me home useCategory', () => {
  it('lifts settings entries onto Me without intermediate profile/settings shells', () => {
    act(() => {
      useUserStore.setState({ isSignedIn: true });
    });

    const { result } = renderHook(() => useCategory(), {
      wrapper: createWrapper(true),
    });

    const groups = result.current;
    const keys = flattenKeys(groups);

    // No intermediate Me shells (old keys: profile/setting menu entries → /me/*)
    expect(keys).not.toContain('setting');
    expect(groups.map((g) => g.key)).not.toContain('setting');

    // Account (remapped general)
    expect(groups.find((g) => g.key === SettingsGroupKey.General)?.title).toBe(
      'setting:group.profile',
    );
    expect(keys).toContain(SettingsTabs.Profile);
    expect(keys).toContain(SettingsTabs.Stats);
    expect(keys).toContain(SettingsTabs.Appearance);

    // Deduped — profile/stats appear once
    expect(keys.filter((k) => k === SettingsTabs.Profile)).toHaveLength(1);
    expect(keys.filter((k) => k === SettingsTabs.Stats)).toHaveLength(1);

    // Plans & billing
    expect(keys).toContain(SettingsTabs.Plans);
    expect(keys).toContain(SettingsTabs.Usage);
    expect(keys).toContain(SettingsTabs.Credits);
    expect(keys).toContain(SettingsTabs.Billing);
    expect(keys).toContain(SettingsTabs.Referral);

    // Agent
    expect(keys).toContain(SettingsTabs.Skill);
    expect(keys).toContain(SettingsTabs.Connector);
    expect(keys).toContain(SettingsTabs.Memory);
    expect(keys).toContain(SettingsTabs.Creds);

    // System
    expect(keys).toContain(SettingsTabs.Storage);
    expect(keys).toContain(SettingsTabs.Advanced);
    expect(keys).toContain(SettingsTabs.About);

    // Other
    const other = groups.find((g) => g.key === MeGroupKey.Other);
    expect(other).toBeDefined();
    expect(other?.items.map((i) => i.key)).toEqual(expect.arrayContaining(['changelog', 'logout']));
  });

  it('navigates to atomic settings paths from lifted items', () => {
    act(() => {
      useUserStore.setState({ isSignedIn: true });
    });

    const { result } = renderHook(() => useCategory(), {
      wrapper: createWrapper(true),
    });

    const credits = result.current
      .flatMap((g) => g.items)
      .find((item) => item.key === SettingsTabs.Credits);

    expect(credits).toBeDefined();
    act(() => {
      credits?.onClick?.({} as any);
    });
    expect(navigate).toHaveBeenCalledWith(`/settings/${SettingsTabs.Credits}`);
  });

  it('when logged out, only keeps the Other group (changelog)', () => {
    act(() => {
      useUserStore.setState({ isSignedIn: false });
    });

    const { result } = renderHook(() => useCategory(), {
      wrapper: createWrapper(true),
    });

    expect(result.current).toHaveLength(1);
    expect(result.current[0].key).toBe(MeGroupKey.Other);
    expect(flattenKeys(result.current)).toContain('changelog');
    expect(flattenKeys(result.current)).not.toContain('logout');
    expect(flattenKeys(result.current)).not.toContain(SettingsTabs.Credits);
  });
});
