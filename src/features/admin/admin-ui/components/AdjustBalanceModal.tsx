'use client';

import { Button, createModal, useModalContext } from '@lobehub/ui/base-ui';
import { App, Form, Input, InputNumber } from 'antd';
import { useState } from 'react';

import { useAdminAccess } from '../hooks/useAdminAccess';
import { adminMockApi } from '../mock/store';
import type { AdminUserRow } from '../types';

interface AdjustBalanceFormValues {
  deltaCredits: number;
  reason: string;
}

interface AdjustBalanceContentProps {
  onSuccess: () => void;
  user: AdminUserRow;
}

const AdjustBalanceContent = ({ onSuccess, user }: AdjustBalanceContentProps) => {
  const { message } = App.useApp();
  const { close } = useModalContext();
  const { can } = useAdminAccess();
  const [submitting, setSubmitting] = useState(false);

  const handleFinish = async ({ deltaCredits, reason }: AdjustBalanceFormValues) => {
    if (!can('billing:balance:adjust')) {
      message.error('当前账号没有调整余额权限');
      return;
    }

    setSubmitting(true);
    try {
      await adminMockApi.adjustBalance({ deltaCredits, reason, userId: user.id });
      message.success(`已更新 ${user.nickname} 的积分余额`);
      onSuccess();
      close();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '调整余额失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form<AdjustBalanceFormValues>
      layout={'vertical'}
      requiredMark={'optional'}
      onFinish={handleFinish}
    >
      <Form.Item label={'当前可用积分'}>
        <Input disabled value={user.balanceCredits.toLocaleString('zh-CN')} />
      </Form.Item>
      <Form.Item
        label={'积分变动'}
        name={'deltaCredits'}
        rules={[
          { required: true, message: '请输入积分变动值' },
          {
            validator: (_, value) =>
              Number.isSafeInteger(value) && value !== 0
                ? Promise.resolve()
                : Promise.reject(new Error('请输入非零整数，扣减请填写负数')),
          },
        ]}
      >
        <InputNumber precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        label={'操作原因'}
        name={'reason'}
        rules={[{ required: true, whitespace: true, message: '必须填写操作原因' }]}
      >
        <Input.TextArea
          showCount
          maxLength={200}
          placeholder={'例如：活动补偿、人工退款'}
          rows={3}
        />
      </Form.Item>
      <Form.Item style={{ marginBottom: 0 }}>
        <Button block htmlType={'submit'} loading={submitting} type={'primary'}>
          保存余额调整
        </Button>
      </Form.Item>
    </Form>
  );
};

export const createAdjustBalanceModal = (user: AdminUserRow, onSuccess: () => void) =>
  createModal({
    content: <AdjustBalanceContent user={user} onSuccess={onSuccess} />,
    footer: null,
    maskClosable: false,
    title: `调整余额 · ${user.nickname}`,
    width: 'min(92vw, 480px)',
  });
