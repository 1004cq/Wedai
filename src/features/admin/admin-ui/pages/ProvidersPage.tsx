'use client';

import { Alert } from '@lobehub/ui/base-ui';
import { Tag } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import { useCallback } from 'react';

import { adminApi } from '../api';
import {
  AdminConfigSurface,
  AdminErrorState,
  AdminLoading,
  AdminPage,
} from '../components/AdminPage';
import { useAdminQuery } from '../hooks/useAdminQuery';

const styles = createStaticStyles(({ css }) => ({
  list: css`
    display: flex;
    flex-direction: column;
    gap: 12px;

    margin: 0;
    padding: 0;

    list-style: none;
  `,
  row: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    align-items: center;
    justify-content: space-between;

    padding-block: 10px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    &:last-child {
      border-block-end: none;
    }
  `,
  meta: css`
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  `,
  envKey: css`
    font-family: ${cssVar.fontFamilyCode};
    font-size: ${cssVar.fontSizeSM};
    color: ${cssVar.colorTextSecondary};
  `,
}));

export const ProvidersPage = () => {
  const loader = useCallback(() => adminApi.getConfigStatus(), []);
  const { data, error, isLoading, reload } = useAdminQuery(loader);

  return (
    <AdminPage
      description={'查看平台模型服务商环境变量是否已配置（Phase 1 只读）。'}
      title={'模型服务商'}
    >
      <Alert
        showIcon
        message={'平台密钥通过服务器环境变量配置'}
        type={'info'}
        description={
          '用户侧「设置 → 模型服务商」在 BYOK_ALLOWED=false 时已关闭。' +
          '请在主机 .env.commercial 中设置 OPENAI_API_KEY、ANTHROPIC_API_KEY 等，然后重启 app 容器。' +
          '本页只显示是否已配置，永不回显密钥明文。'
        }
      />
      {error ? (
        <AdminErrorState error={error} onRetry={reload} />
      ) : isLoading || !data ? (
        <AdminLoading />
      ) : (
        <AdminConfigSurface>
          <Alert
            showIcon
            style={{ marginBottom: 16 }}
            type={data.llm.byokAllowed ? 'warning' : 'success'}
            description={
              data.llm.byokAllowed
                ? '设置 BYOK_ALLOWED=false 可强制全部流量走平台计费，并隐藏用户 Provider 配置入口。'
                : `已配置 ${data.llm.configuredCount} / ${data.llm.totalProviders} 个常用服务商密钥。`
            }
            message={
              data.llm.byokAllowed
                ? '当前允许用户自带 Key（BYOK）'
                : '已禁用用户自带 Key：仅使用平台环境变量密钥'
            }
          />
          <ul className={styles.list}>
            {data.llm.providers.map((provider) => (
              <li className={styles.row} key={provider.id}>
                <div className={styles.meta}>
                  <span>{provider.label}</span>
                  <span className={styles.envKey}>{provider.envKey}</span>
                </div>
                {provider.configured ? <Tag color={'success'}>已配置</Tag> : <Tag>未配置</Tag>}
              </li>
            ))}
          </ul>
        </AdminConfigSurface>
      )}
    </AdminPage>
  );
};
