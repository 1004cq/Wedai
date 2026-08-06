'use client';

import { Button, Select, Switch } from '@lobehub/ui/base-ui';
import { Alert, App, Form, Input, Tag } from 'antd';
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
import type { SmsConfigUpdate } from '../types';

export const SmsConfigPage = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm<SmsConfigUpdate>();
  const provider = Form.useWatch('provider', form);
  const { can } = useAdminAccess();
  const canWrite = can('system:sms:config');
  const [saving, setSaving] = useState(false);
  const loader = useCallback(() => adminMockApi.getSmsConfig(), []);
  const { data, error, isLoading, reload } = useAdminQuery(loader);

  useEffect(() => {
    if (!data) return;
    form.setFieldsValue({
      enablePhoneRegister: data.enablePhoneRegister,
      enabled: data.enabled,
      endpoint: data.endpoint,
      provider: data.provider,
      region: data.region,
      signName: data.signName,
      templateCode: data.templateCode,
    });
  }, [data, form]);

  const handleFinish = async (values: SmsConfigUpdate) => {
    if (!can('system:sms:config')) {
      message.error('当前账号没有短信配置权限');
      return;
    }
    setSaving(true);
    try {
      await adminMockApi.updateSmsConfig(values);
      form.setFieldsValue({ accessKeyId: undefined, accessKeySecret: undefined });
      message.success('短信配置已保存');
      reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '短信配置保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPage description={'配置短信验证码服务与手机号注册通道。'} title={'短信 API'}>
      <Alert
        showIcon
        message={'密钥安全'}
        type={'warning'}
        description={
          'AccessKey 必须由服务端加密存储；审计日志只能记录配置状态与服务商，不能记录密钥值。'
        }
      />
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
            <Form.Item label={'启用短信'} name={'enabled'} valuePropName={'checked'}>
              <Switch />
            </Form.Item>
            <Form.Item label={'服务商'} name={'provider'}>
              <Select
                options={[
                  { label: '阿里云短信', value: 'aliyun' },
                  { label: '腾讯云短信', value: 'tencent' },
                  { label: '自定义 HTTP', value: 'custom' },
                ]}
              />
            </Form.Item>
            <Form.Item
              extra={data.accessKeyIdConfigured ? <Tag color={'success'}>已配置</Tag> : '尚未配置'}
              help={'留空不会覆盖已有 AccessKey ID。'}
              label={'AccessKey ID'}
              name={'accessKeyId'}
            >
              <Input.Password autoComplete={'new-password'} placeholder={'留空则不修改'} />
            </Form.Item>
            <Form.Item
              help={'留空不会覆盖已有 AccessKey Secret。'}
              label={'AccessKey Secret'}
              name={'accessKeySecret'}
              extra={
                data.accessKeySecretConfigured ? <Tag color={'success'}>已配置</Tag> : '尚未配置'
              }
            >
              <Input.Password autoComplete={'new-password'} placeholder={'留空则不修改'} />
            </Form.Item>
            <Form.Item label={'短信签名'} name={'signName'}>
              <Input />
            </Form.Item>
            <Form.Item label={'模板编码'} name={'templateCode'}>
              <Input />
            </Form.Item>
            <Form.Item label={'Region'} name={'region'}>
              <Input />
            </Form.Item>
            {provider === 'custom' && (
              <Form.Item
                label={'HTTP Endpoint'}
                name={'endpoint'}
                rules={[{ type: 'url', message: '请输入完整 URL' }]}
              >
                <Input placeholder={'https://sms.example.com/send'} />
              </Form.Item>
            )}
            <Form.Item
              label={'启用手机号注册'}
              name={'enablePhoneRegister'}
              valuePropName={'checked'}
            >
              <Switch />
            </Form.Item>
            {canWrite && (
              <Button htmlType={'submit'} loading={saving} type={'primary'}>
                保存短信配置
              </Button>
            )}
          </Form>
        </AdminConfigSurface>
      )}
    </AdminPage>
  );
};
