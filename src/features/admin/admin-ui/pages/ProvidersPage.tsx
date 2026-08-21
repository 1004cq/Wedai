'use client';

import { Alert, Button, Switch } from '@lobehub/ui/base-ui';
import { App, Form, Input, Tag } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import { useCallback, useState } from 'react';

import { adminApi } from '../api';
import {
  AdminConfigSurface,
  AdminErrorState,
  AdminLoading,
  AdminPage,
} from '../components/AdminPage';
import { useAdminAccess } from '../hooks/useAdminAccess';
import { useAdminQuery } from '../hooks/useAdminQuery';

type ProviderStatus = Awaited<
  ReturnType<typeof adminApi.getConfigStatus>
>['llm']['providers'][number];

const styles = createStaticStyles(({ css }) => ({
  list: css`
    display: flex;
    flex-direction: column;
    gap: 16px;

    margin: 0;
    padding: 0;

    list-style: none;
  `,
  card: css`
    display: flex;
    flex-direction: column;
    gap: 12px;

    padding-block: 12px;
    padding-inline: 0;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    &:last-child {
      border-block-end: none;
    }
  `,
  header: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    align-items: center;
    justify-content: space-between;
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
  tags: css`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  `,
  formRow: css`
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;

    @media (width >= 768px) {
      grid-template-columns: 1fr 1fr auto;
      align-items: end;
    }
  `,
}));

const sourceTag = (source: ProviderStatus['source']) => {
  switch (source) {
    case 'both': {
      return <Tag color={'processing'}>环境变量 + 后台</Tag>;
    }
    case 'db': {
      return <Tag color={'success'}>后台已保存</Tag>;
    }
    case 'env': {
      return <Tag color={'blue'}>环境变量</Tag>;
    }
    default: {
      return <Tag>未配置</Tag>;
    }
  }
};

const ProviderEditor = ({
  canWrite,
  onSaved,
  provider,
}: {
  canWrite: boolean;
  onSaved: () => void;
  provider: ProviderStatus;
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<{
    accessKeyId?: string;
    apiKey?: string;
    baseURL?: string;
    enabled: boolean;
    region?: string;
    secretAccessKey?: string;
  }>();
  const [saving, setSaving] = useState(false);
  const isBedrock = provider.id === 'bedrock';

  const handleFinish = async (values: {
    accessKeyId?: string;
    apiKey?: string;
    baseURL?: string;
    enabled: boolean;
    region?: string;
    secretAccessKey?: string;
  }) => {
    if (!canWrite) {
      message.error('当前账号没有模型服务商配置权限');
      return;
    }
    setSaving(true);
    try {
      await adminApi.updateLlmProvider({
        accessKeyId: values.accessKeyId,
        apiKey: values.apiKey,
        baseURL: values.baseURL?.trim() ? values.baseURL.trim() : null,
        enabled: values.enabled,
        providerId: provider.id,
        region: values.region?.trim() ? values.region.trim() : null,
        secretAccessKey: values.secretAccessKey,
      });
      form.setFieldsValue({
        accessKeyId: undefined,
        apiKey: undefined,
        secretAccessKey: undefined,
      });
      message.success(`${provider.label} 密钥已保存`);
      onSaved();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!canWrite) return;
    setSaving(true);
    try {
      await adminApi.updateLlmProvider({
        clearSecrets: true,
        enabled: form.getFieldValue('enabled') ?? provider.enabled,
        providerId: provider.id,
      });
      message.success(`${provider.label} 已清除后台密钥`);
      onSaved();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '清除失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className={styles.card}>
      <div className={styles.header}>
        <div className={styles.meta}>
          <span>{provider.label}</span>
          <span className={styles.envKey}>{provider.envKey}</span>
        </div>
        <div className={styles.tags}>
          {sourceTag(provider.source)}
          {provider.configured ? <Tag color={'success'}>可用</Tag> : <Tag>不可用</Tag>}
        </div>
      </div>
      <Form
        disabled={!canWrite || saving}
        form={form}
        layout={'vertical'}
        initialValues={{
          baseURL: provider.baseURL ?? undefined,
          enabled: provider.enabled,
          region: provider.region ?? undefined,
        }}
        onFinish={handleFinish}
      >
        <Form.Item label={'启用后台密钥'} name={'enabled'} valuePropName={'checked'}>
          <Switch />
        </Form.Item>
        {isBedrock ? (
          <div className={styles.formRow}>
            <Form.Item
              extra={provider.dbConfigured ? <Tag color={'success'}>已配置</Tag> : '尚未配置'}
              help={'留空不会覆盖已有 Access Key。'}
              label={'Access Key ID'}
              name={'accessKeyId'}
            >
              <Input autoComplete={'off'} placeholder={'留空则不修改'} />
            </Form.Item>
            <Form.Item
              help={'留空不会覆盖已有 Secret。'}
              label={'Secret Access Key'}
              name={'secretAccessKey'}
            >
              <Input.Password autoComplete={'new-password'} placeholder={'留空则不修改'} />
            </Form.Item>
            <Form.Item label={'Region'} name={'region'}>
              <Input placeholder={'例如 us-east-1'} />
            </Form.Item>
          </div>
        ) : (
          <div className={styles.formRow}>
            <Form.Item
              extra={provider.dbConfigured ? <Tag color={'success'}>已配置</Tag> : '尚未配置'}
              help={'留空不会覆盖已有密钥。'}
              label={'API Key'}
              name={'apiKey'}
            >
              <Input.Password autoComplete={'new-password'} placeholder={'留空则不修改'} />
            </Form.Item>
            <Form.Item help={'可选，覆盖默认 API Base URL。'} label={'Base URL'} name={'baseURL'}>
              <Input placeholder={'https://api.example.com/v1'} />
            </Form.Item>
            <Form.Item label={' '}>
              <Button htmlType={'submit'} loading={saving} type={'primary'}>
                保存
              </Button>
            </Form.Item>
          </div>
        )}
        {isBedrock ? (
          <Form.Item>
            <Button htmlType={'submit'} loading={saving} type={'primary'}>
              保存
            </Button>
          </Form.Item>
        ) : null}
        {provider.dbConfigured ? (
          <Button danger disabled={!canWrite || saving} type={'text'} onClick={handleClear}>
            清除后台密钥
          </Button>
        ) : null}
      </Form>
    </li>
  );
};

export const ProvidersPage = () => {
  const { can } = useAdminAccess();
  const canWrite = can('system:llm:config');
  const loader = useCallback(() => adminApi.getConfigStatus(), []);
  const { data, error, isLoading, reload } = useAdminQuery(loader);

  return (
    <AdminPage
      description={'在后台填写平台模型密钥；加密存储，前端永不回显明文。'}
      title={'模型服务商'}
    >
      <Alert
        showIcon
        message={'平台密钥可在此填写，也可继续使用环境变量'}
        type={'info'}
        description={
          '用户侧「设置 → 模型服务商」在 BYOK_ALLOWED=false 时已关闭。' +
          '此处保存的密钥写入数据库（KEY_VAULTS_SECRET 加密），优先于同名环境变量用于聊天。' +
          '环境变量仍可作为兜底。应用设置里已隐藏「服务模型」入口。本页永不回显密钥明文。'
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
                : '已禁用用户自带 Key：仅使用平台密钥'
            }
          />
          <ul className={styles.list}>
            {data.llm.providers.map((provider) => (
              <ProviderEditor
                canWrite={canWrite}
                key={`${provider.id}:${provider.source}:${provider.dbConfigured}:${provider.baseURL ?? ''}:${provider.enabled}`}
                provider={provider}
                onSaved={reload}
              />
            ))}
          </ul>
        </AdminConfigSurface>
      )}
    </AdminPage>
  );
};
