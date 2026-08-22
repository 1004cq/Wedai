'use client';

import { Text } from '@lobehub/ui';
import { Button, Select, Switch } from '@lobehub/ui/base-ui';
import { App, Form, Input, Tag } from 'antd';
import { createStaticStyles } from 'antd-style';
import { useCallback, useEffect, useState } from 'react';

import { adminApi } from '../api';
import {
  AdminConfigSurface,
  AdminErrorState,
  AdminLoading,
  AdminPage,
} from '../components/AdminPage';
import { useAdminAccess } from '../hooks/useAdminAccess';
import { useAdminQuery } from '../hooks/useAdminQuery';
import type { SmsConfigUpdate } from '../types';

const styles = createStaticStyles(({ css, cssVar }) => ({
  hint: css`
    margin-block-end: 16px;
    padding-block: 12px;
    padding-inline: 16px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorFillQuaternary};
  `,
}));

export const SmsConfigPage = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm<SmsConfigUpdate>();
  const { can } = useAdminAccess();
  const canWrite = can('system:sms:config');
  const [saving, setSaving] = useState(false);
  const loader = useCallback(() => adminApi.getSmsConfig(), []);
  const { data, error, isLoading, reload } = useAdminQuery(loader);

  useEffect(() => {
    if (!data) return;
    form.setFieldsValue({
      enablePhoneRegister: data.enablePhoneRegister,
      enabled: data.enabled,
      mock: data.mock,
      provider: data.provider,
      schemeName: data.schemeName ?? undefined,
      signName: data.signName ?? undefined,
      templateCode: data.templateCode ?? undefined,
    });
  }, [data, form]);

  const handleFinish = async (values: SmsConfigUpdate) => {
    if (!canWrite) {
      message.error('当前账号没有短信配置权限');
      return;
    }
    setSaving(true);
    try {
      await adminApi.updateSmsConfig(values);
      form.setFieldsValue({ accessKeyId: undefined, accessKeySecret: undefined });
      message.success('短信认证配置已保存');
      reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '短信配置保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPage
      description={'阿里云号码认证（PNVS）短信验证码 — 请使用控制台「系统赠送」签名与模板。'}
      title={'短信认证'}
    >
      <div className={styles.hint}>
        <Text strong>号码认证服务（Dypnsapi）</Text>
        <Text type={'secondary'}>
          仅使用 SendSmsVerifyCode /
          CheckSmsVerifyCode。不要使用短信服务（Dysmsapi）自定义签名。AccessKey
          仅服务端存储，接口不回传明文密钥。
        </Text>
      </div>
      {error ? (
        <AdminErrorState error={error} onRetry={reload} />
      ) : isLoading || !data ? (
        <AdminLoading />
      ) : (
        <AdminConfigSurface>
          <Form<SmsConfigUpdate>
            disabled={!canWrite}
            form={form}
            layout={'vertical'}
            onFinish={handleFinish}
          >
            <Form.Item label={'启用短信认证'} name={'enabled'} valuePropName={'checked'}>
              <Switch />
            </Form.Item>
            <Form.Item label={'Mock（仅开发）'} name={'mock'} valuePropName={'checked'}>
              <Switch />
            </Form.Item>
            <Form.Item label={'服务商'} name={'provider'}>
              <Select
                options={[
                  { label: '阿里云号码认证 (PNVS)', value: 'aliyun_pnvs' },
                  { label: 'Mock（不外发）', value: 'mock' },
                ]}
              />
            </Form.Item>
            <Form.Item
              help={'留空不会覆盖已有 AccessKey ID。'}
              label={'AccessKey ID'}
              name={'accessKeyId'}
              extra={
                data.accessKeyIdMasked ? (
                  <Tag color={'blue'}>已配置 {data.accessKeyIdMasked}</Tag>
                ) : (
                  '尚未配置'
                )
              }
            >
              <Input.Password autoComplete={'new-password'} placeholder={'留空则不修改'} />
            </Form.Item>
            <Form.Item
              extra={
                data.accessKeySecretConfigured ? <Tag color={'success'}>已配置</Tag> : '尚未配置'
              }
              help={'留空不会覆盖已有 AccessKey Secret。'}
              label={'AccessKey Secret'}
              name={'accessKeySecret'}
            >
              <Input.Password autoComplete={'new-password'} placeholder={'留空则不修改'} />
            </Form.Item>
            <Form.Item
              help={'控制台「系统赠送」签名名称'}
              label={'签名 (signName)'}
              name={'signName'}
            >
              <Input placeholder={'系统赠送签名'} />
            </Form.Item>
            <Form.Item
              help={'控制台「系统赠送」模板 CODE'}
              label={'模板 (templateCode)'}
              name={'templateCode'}
            >
              <Input placeholder={'SMS_xxxxxx'} />
            </Form.Item>
            <Form.Item label={'方案名称 (schemeName，可选)'} name={'schemeName'}>
              <Input placeholder={'与发送接口一致时填写'} />
            </Form.Item>
            <Form.Item
              label={'启用手机号注册/登录'}
              name={'enablePhoneRegister'}
              valuePropName={'checked'}
            >
              <Switch />
            </Form.Item>
            {canWrite && (
              <Button htmlType={'submit'} loading={saving} type={'primary'}>
                保存配置
              </Button>
            )}
          </Form>
        </AdminConfigSurface>
      )}
    </AdminPage>
  );
};
