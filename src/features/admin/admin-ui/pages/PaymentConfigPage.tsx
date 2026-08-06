'use client';

import { Button, Switch } from '@lobehub/ui/base-ui';
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
import type { AlipayConfigUpdate } from '../types';

export const PaymentConfigPage = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm<AlipayConfigUpdate>();
  const { can } = useAdminAccess();
  const canWrite = can('billing:payment:config');
  const [saving, setSaving] = useState(false);
  const loader = useCallback(() => adminMockApi.getAlipayConfig(), []);
  const { data, error, isLoading, reload } = useAdminQuery(loader);

  useEffect(() => {
    if (!data) return;
    form.setFieldsValue({
      appId: data.appId,
      enabled: data.enabled,
      notifyUrl: data.notifyUrl,
      returnUrl: data.returnUrl,
      sandbox: data.sandbox,
      signType: 'RSA2',
    });
  }, [data, form]);

  const handleFinish = async (values: AlipayConfigUpdate) => {
    if (!can('billing:payment:config')) {
      message.error('当前账号没有支付配置权限');
      return;
    }
    setSaving(true);
    try {
      await adminMockApi.updateAlipayConfig(values);
      form.setFieldsValue({ alipayPublicKey: undefined, privateKey: undefined });
      message.success('支付宝配置已保存');
      reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '支付宝配置保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPage description={'支付宝 RSA2 收款、回调与沙箱配置。'} title={'支付配置'}>
      <Alert
        showIcon
        message={'敏感配置安全要求'}
        type={'warning'}
        description={
          '生产密钥必须由服务端加密存储或托管到 KMS，禁止把密钥写入前端代码、日志或浏览器存储。'
        }
      />
      {error ? (
        <AdminErrorState error={error} onRetry={reload} />
      ) : isLoading || !data ? (
        <AdminLoading />
      ) : (
        <AdminConfigSurface>
          <Form<AlipayConfigUpdate>
            disabled={!canWrite}
            form={form}
            layout={'vertical'}
            onFinish={handleFinish}
          >
            <Form.Item label={'启用支付宝'} name={'enabled'} valuePropName={'checked'}>
              <Switch />
            </Form.Item>
            <Form.Item label={'App ID'} name={'appId'}>
              <Input autoComplete={'off'} />
            </Form.Item>
            <Form.Item
              extra={data.privateKeyConfigured ? <Tag color={'success'}>已配置</Tag> : '尚未配置'}
              help={'仅在需要更新时填写，留空不会覆盖已有私钥。'}
              label={'商户应用私钥（PKCS8 / RSA2）'}
              name={'privateKey'}
            >
              <Input.TextArea
                autoComplete={'new-password'}
                autoSize={{ maxRows: 8, minRows: 4 }}
                placeholder={'留空则不修改'}
              />
            </Form.Item>
            <Form.Item
              help={'仅在需要更新时填写，留空不会覆盖已有公钥。'}
              label={'支付宝公钥'}
              name={'alipayPublicKey'}
              extra={
                data.alipayPublicKeyConfigured ? <Tag color={'success'}>已配置</Tag> : '尚未配置'
              }
            >
              <Input.TextArea
                autoComplete={'new-password'}
                autoSize={{ maxRows: 8, minRows: 4 }}
                placeholder={'留空则不修改'}
              />
            </Form.Item>
            <Form.Item initialValue={'RSA2'} label={'签名类型'} name={'signType'}>
              <Input disabled />
            </Form.Item>
            <Form.Item
              label={'异步通知地址'}
              name={'notifyUrl'}
              rules={[{ type: 'url', message: '请输入公网可访问的 URL' }]}
            >
              <Input placeholder={'https://cq.je/api/webhooks/alipay'} />
            </Form.Item>
            <Form.Item
              label={'同步跳转地址（可选）'}
              name={'returnUrl'}
              rules={[{ type: 'url', warningOnly: true, message: '请输入完整 URL' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item label={'沙箱模式'} name={'sandbox'} valuePropName={'checked'}>
              <Switch />
            </Form.Item>
            {canWrite && (
              <Button htmlType={'submit'} loading={saving} type={'primary'}>
                保存支付配置
              </Button>
            )}
          </Form>
        </AdminConfigSurface>
      )}
    </AdminPage>
  );
};
