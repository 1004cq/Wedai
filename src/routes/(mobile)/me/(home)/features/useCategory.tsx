import { LOBE_CHAT_CLOUD, UTM_SOURCE } from '@lobechat/business-const';
import { OFFICIAL_URL } from '@lobechat/const';
import { Cloudy, FileClockIcon, LogOut } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import useBusinessMeCells from '@/business/client/features/User/useBusinessMeCells';
import { type CellProps } from '@/components/Cell';
import { openChangelogModal } from '@/components/ChangelogModal';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { featureFlagsSelectors, useServerConfigStore } from '@/store/serverConfig';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

import {
  type CategoryGroup,
  SettingsGroupKey,
  useCategory as useSettingsCategory,
} from '../../settings/features/useCategory';

export enum MeGroupKey {
  Other = 'other',
}

export interface MeCategoryItem extends Omit<CellProps, 'type'> {
  key: string;
}

export interface MeCategoryGroup {
  items: MeCategoryItem[];
  key: string;
  title: string;
}

const isActionCell = (item: CellProps): item is MeCategoryItem =>
  item.type !== 'divider' && typeof item.key === 'string';

/**
 * Flat Me-page IA: lift settings/account entries onto `/me` in groups,
 * without intermediate `/me/profile` or `/me/settings` shells.
 */
export const useCategory = (): MeCategoryGroup[] => {
  const navigate = useWorkspaceAwareNavigate();
  const { t } = useTranslation(['common', 'setting', 'auth']);
  const { showCloudPromotion, hideDocs } = useServerConfigStore(featureFlagsSelectors);
  const [isLoginWithAuth, isLogin, signOut] = useUserStore((s) => [
    authSelectors.isLoginWithAuth(s),
    authSelectors.isLogin(s),
    s.logout,
  ]);
  const businessMeCells = useBusinessMeCells();
  const settingsGroups = useSettingsCategory();

  return useMemo(() => {
    const otherItems: MeCategoryItem[] = [
      ...(isLoginWithAuth ? businessMeCells.filter(isActionCell) : []),
      showCloudPromotion && {
        icon: Cloudy,
        key: 'cloud',
        label: t('userPanel.cloud', { name: LOBE_CHAT_CLOUD }),
        onClick: () => window.open(`${OFFICIAL_URL}?utm_source=${UTM_SOURCE}`, '__blank'),
      },
      !hideDocs && {
        icon: FileClockIcon,
        key: 'changelog',
        label: t('changelog'),
        onClick: () => openChangelogModal(),
      },
      isLogin && {
        icon: LogOut,
        key: 'logout',
        label: t('signout', { ns: 'auth' }),
        onClick: () => {
          signOut();
          navigate('/signin');
        },
      },
    ].filter(Boolean) as MeCategoryItem[];

    if (!isLoginWithAuth) {
      return otherItems.length > 0
        ? [{ items: otherItems, key: MeGroupKey.Other, title: t('setting:group.other') }]
        : [];
    }

    const accountTitle = t('setting:group.profile');

    const liftedGroups: MeCategoryGroup[] = settingsGroups.map((group: CategoryGroup) => {
      if (group.key === SettingsGroupKey.General) {
        return { ...group, title: accountTitle };
      }
      return group;
    });

    if (otherItems.length > 0) {
      liftedGroups.push({
        items: otherItems,
        key: MeGroupKey.Other,
        title: t('setting:group.other'),
      });
    }

    return liftedGroups;
  }, [
    businessMeCells,
    hideDocs,
    isLogin,
    isLoginWithAuth,
    navigate,
    settingsGroups,
    showCloudPromotion,
    signOut,
    t,
  ]);
};
