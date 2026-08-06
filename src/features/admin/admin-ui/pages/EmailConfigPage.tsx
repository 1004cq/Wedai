'use client';

import { Button, Select, Switch } from '@lobehub/ui/base-ui';
import { Alert, App, Form, Input, InputNumber, Tag } from 'antd';
import { useCallback, useEffect, useState } from 'react';

import {
  AdminConfigSurface,
  AdminErrorState,
  AdminLoading,
  AdminPage,
} from '../components/AdminPage';
import { useAdminAccess } from '../hooks/useAdminAccess';
import { useAdminQuery } from '../hooks/useAdminQuery';
import { adminMockApi } from '../mock/store';
import type { SmtpConfigUpdate, SmtpProviderPreset } from '../types';

const SMTP_PRESETS: Record<
  Exclude<SmtpProviderPreset, 'custom'>,
  Pick<SmtpConfigUpdate, 'host' | 'port' | 'secure'>
> = {
  '126': { host: 'smtp.126.com', port: 465, secure: true },
  '163': { host: 'smtp.163.com', port: 465, secure: true },
  'aliyun': { host: 'smtpdm.aliyun.com', port: 465, secure: true },
  'gmail': { host: 'smtp.gmail.com', port: 465, secure: true },
  'outlook': { host: 'smtp.office365.com', port: 587, secure: false },
  'qq': { host: 'smtp.qq.com', port: 465, secure: true },
  'sendgrid': { host: 'smtp.sendgrid.net', port: 587, secure: false },
};

const SMTP_PROVIDER_OPTIONS = [
  { label: 'Gmail', value: 'gmail' },
  { label: 'Outlook / Office365', value: 'outlook' },
  { label: 'QQ 邮箱', value: 'qq' },
  { label: '163 邮箱', value: '163' },
  { label: '126 邮箱', value: '126' },
  { label: '阿里云邮件推送', value: 'aliyun' },
  { label: 'SendGrid', value: 'sendgrid' },
  { label: '自定义', value: 'custom' },
];

export const EmailConfigPage = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm<SmtpConfigUpdate>();
  const { can } = useAdminAccess();
  const canWrite = can('system:email:config');
  const [saving, setSaving] = useState(false);
  const loader = useCallback(() => adminMockApi.getSmtpConfig(), []);
  const { data, error, isLoading, reload } = useAdminQuery(loader);

  useEffect(() => {
    if (!data) return;
    form.setFieldsValue({
      enableEmailRegister: data.enableEmailRegister,
      enabled: data.enabled,
      fromEmail: data.fromEmail,
      fromName: data.fromName,
      host: data.host,
      port: data.port,
      provider: data.provider,
      secure: data.secure,
      username: data.username,
    });
  }, [data, form]);

  const handleProviderChange = (provider: SmtpProviderPreset) => {
    if (provider === 'custom') return;
    form.setFieldsValue(SMTP_PRESETS[provider]);
  };

  const handleFinish = async (values: SmtpConfigUpdate) => {
    if (!can('system:email:config')) {
      message.error('当前账号没有 SMTP 配置权限');
      return;
    }
    setSaving(true);
    try {
      await adminMockApi.updateSmtpConfig(values);
      form.setFieldValue('password', undefined);
      message.success('SMTP 配置已保存');
      reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : 'SMTP 配置保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPage description={'配置事务邮件与邮箱注册通道。'} title={'邮箱 SMTP'}>
      <Alert
        showIcon
        description={'SMTP 密码必须由服务端加密存储；前端只读取“已配置”状态，永远不回显密码。'}
        message={'密钥安全'}
        type={'warning'}
      />
      {error ? (
        <AdminErrorState error={error} onRetry={reload} />
      ) : isLoading || !data ? (
        <AdminLoading />
      ) : (
        <AdminConfigSurface>
          <Form<SmtpConfigUpdate>
            disabled={!canWrite}
            form={form}
            layout={'vertical'}
            onFinish={handleFinish}
          >
            <Form.Item label={'启用 SMTP'} name={'enabled'} valuePropName={'checked'}>
              <Switch />
            </Form.Item>
            <Form.Item label={'服务商'} name={'provider'}>
              <Select
                options={SMTP_PROVIDER_OPTIONS}
                onChange={(value) => handleProviderChange(value as SmtpProviderPreset)}
              />
            </Form.Item>
            <Form.Item label={'Host'} name={'host'}>
              <Input />
            </Form.Item>
            <Form.Item label={'Port'} name={'port'}>
              <InputNumber min={1} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label={'使用 TLS/SSL'} name={'secure'} valuePropName={'checked'}>
              <Switch />
            </Form.Item>
            <Form.Item label={'用户名'} name={'username'}>
              <Input autoComplete={'off'} />
            </Form.Item>
            <Form.Item
              extra={data.passwordConfigured ? <Tag color={'success'}>已配置</Tag> : '尚未配置'}
              help={'留空不会覆盖已有密码。'}
              label={'密码 / 授权码'}
              name={'password'}
            >
              <Input.Password autoComplete={'new-password'} placeholder={'留空则不修改'} />
            </Form.Item>
            <Form.Item label={'发件人名称'} name={'fromName'}>
              <Input />
            </Form.Item>
            <Form.Item
              label={'发件人邮箱'}
              name={'fromEmail'}
              rules={[{ type: 'email', message: '请输入有效邮箱' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              label={'启用邮箱注册'}
              name={'enableEmailRegister'}
              valuePropName={'checked'}
            >
              <Switch />
            </Form.Item>
            {canWrite && (
              <Button htmlType={'submit'} loading={saving} type={'primary'}>
                保存 SMTP 配置
              </Button>
            )}
          </Form>
        </AdminConfigSurface>
      )}
    </AdminPage>
  );
};
