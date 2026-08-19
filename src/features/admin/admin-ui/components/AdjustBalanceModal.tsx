'use client';

import { Button, createModal, useModalContext } from '@lobehub/ui/base-ui';
import { App, Form, Input, InputNumber } from 'antd';
import { useState } from 'react';

import { adminApi } from '../api';
import { useAdminAccess } from '../hooks/useAdminAccess';
import type { AdminUserRow } from '../types';

interface AdjustBalanceFormValues {
  credits: number;
  direction: 'credit' | 'debit';
  reason: string;
  idempotencyKey: string;
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
  const [direction, setDirection] = useState<'credit' | 'debit'>('credit');

  const handleFinish = async ({ credits, reason, idempotencyKey }: AdjustBalanceFormValues) => {
    if (!can('billing:balance:adjust')) {
      message.error('当前账号没有调整余额权限');
      return;
    }
    if (!credits || credits <= 0) {
      message.error('积分必须为正整数');
      return;
    }

    setSubmitting(true);
    try {
      // Fetch billingAccountId for this user first.
      const detail = await adminApi.getUser(user.id);
      if (!detail.billingAccountId) {
        message.error('该用户没有关联的计费账户');
        return;
      }

      const key = idempotencyKey.trim() || `admin-${Date.now()}-${user.id}`;

      if (direction === 'credit') {
        const result = await adminApi.creditBalance({
          billingAccountId: detail.billingAccountId,
          credits,
          reason,
          idempotencyKey: key,
        });
        message.success(
          `已为 ${user.nickname} 充入 ${credits.toLocaleString()} 积分，操作后余额：${result.availableAfter}`,
        );
      } else {
        await adminApi.debitBalance({
          billingAccountId: detail.billingAccountId,
          credits,
          reason,
          idempotencyKey: key,
        });
        message.success(`已从 ${user.nickname} 扣减 ${credits.toLocaleString()} 积分`);
      }

      onSuccess();
      close();
    } catch (error) {
      const msg = error instanceof Error ? error.message : '调整余额失败';
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form<AdjustBalanceFormValues>
      initialValues={{ direction: 'credit' }}
      layout={'vertical'}
      requiredMark={'optional'}
      onFinish={handleFinish}
      onValuesChange={(changed) => {
        if (changed.direction) setDirection(changed.direction);
      }}
    >
      <Form.Item label={'操作类型'} name={'direction'}>
        <Input.Group compact>
          <Button
            style={{ width: '50%' }}
            type={direction === 'credit' ? 'primary' : 'default'}
            onClick={() => setDirection('credit')}
          >
            充入积分
          </Button>
          <Button
            danger={direction === 'debit'}
            style={{ width: '50%' }}
            type={direction === 'debit' ? 'primary' : 'default'}
            onClick={() => setDirection('debit')}
          >
            扣减积分
          </Button>
        </Input.Group>
      </Form.Item>
      <Form.Item
        label={'积分数量（正整数）'}
        name={'credits'}
        rules={[
          { required: true, message: '请输入积分数量' },
          {
            validator: (_, value) =>
              Number.isInteger(value) && value > 0
                ? Promise.resolve()
                : Promise.reject(new Error('请输入正整数')),
          },
        ]}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
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
      <Form.Item
        label={'幂等键（可选，留空自动生成）'}
        name={'idempotencyKey'}
        tooltip={'相同幂等键重复提交只生效一次，可用于防止表单重复提交'}
      >
        <Input maxLength={128} placeholder={'留空则自动生成'} />
      </Form.Item>
      <Form.Item style={{ marginBottom: 0 }}>
        <Button
          block
          danger={direction === 'debit'}
          htmlType={'submit'}
          loading={submitting}
          type={'primary'}
        >
          {direction === 'credit' ? '确认充入' : '确认扣减'}
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
    title: `调整余额 · ${user.nickname || user.id}`,
    width: 'min(92vw, 520px)',
  });
