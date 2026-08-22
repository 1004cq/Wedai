'use client';

import { Text } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';

export type AuthMethod = 'email' | 'phone';

const styles = createStaticStyles(({ css, cssVar }) => ({
  tab: css`
    cursor: pointer;

    flex: 1;

    padding-block: 8px;
    border: none;
    border-block-end: 2px solid transparent;

    font-size: 14px;
    font-weight: 500;
    color: ${cssVar.colorTextSecondary};
    text-align: center;

    background: transparent;

    transition:
      color 0.15s ease,
      border-color 0.15s ease;

    &[data-active='true'] {
      border-block-end-color: ${cssVar.colorPrimary};
      color: ${cssVar.colorPrimary};
    }
  `,
  tabs: css`
    display: flex;
    gap: 8px;
    margin-block-end: 20px;
  `,
}));

export interface AuthMethodTabsProps {
  method: AuthMethod;
  onChange: (method: AuthMethod) => void;
}

export const AuthMethodTabs = ({ method, onChange }: AuthMethodTabsProps) => {
  const { t } = useTranslation('auth');

  return (
    <div className={styles.tabs} role="tablist">
      <button
        className={styles.tab}
        data-active={method === 'email'}
        role="tab"
        type="button"
        onClick={() => onChange('email')}
      >
        <Text>{t('betterAuth.method.email')}</Text>
      </button>
      <button
        className={styles.tab}
        data-active={method === 'phone'}
        role="tab"
        type="button"
        onClick={() => onChange('phone')}
      >
        <Text>{t('betterAuth.method.phone')}</Text>
      </button>
    </div>
  );
};
