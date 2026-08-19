'use client';

import { Button, createModal, useModalContext } from '@lobehub/ui/base-ui';
import { App, Form, Input } from 'antd';
import { useState } from 'react';

import { adminApi } from '../api';
import { useAdminAccess } from '../hooks/useAdminAccess';
import type { AdminUserRow } from '../types';

interface BanFormValues {
  reason: string;
}

const UserBanContent = ({ user, onSuccess }: { onSuccess: () => void; user: AdminUserRow }) => {
  const { message } = App.useApp();
  const { close } = useModalContext();
  const { can } = useAdminAccess();
  const [submitting, setSubmitting] = useState(false);
  const banned = user.status === 'banned';

  const handleFinish = async ({ reason }: BanFormValues) => {
    if (!can('user:ban')) {
      message.error('当前账号没有封禁管理权限');
      return;
    }

    setSubmitting(true);
    try {
      await adminApi.setUserBan({ banned: !banned, reason, userId: user.id });
      message.success(banned ? '已解除用户封禁' : '已封禁用户');
      onSuccess();
      close();
    } catch (error) {
      const msg = error instanceof Error ? error.message : '更新用户状态失败';
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form<BanFormValues> layout={'vertical'} onFinish={handleFinish}>
      <Form.Item
        label={'操作原因'}
        name={'reason'}
        rules={[{ required: true, whitespace: true, message: '必须填写操作原因' }]}
      >
        <Input.TextArea showCount maxLength={200} rows={4} />
      </Form.Item>
      <Button block danger={!banned} htmlType={'submit'} loading={submitting} type={'primary'}>
        {banned ? '解除封禁' : '确认封禁'}
      </Button>
    </Form>
  );
};

export const createUserBanModal = (user: AdminUserRow, onSuccess: () => void) =>
  createModal({
    content: <UserBanContent user={user} onSuccess={onSuccess} />,
    footer: null,
    maskClosable: false,
    title: `${user.status === 'banned' ? '解除封禁' : '封禁用户'} · ${user.nickname || user.id}`,
    width: 'min(92vw, 480px)',
  });
