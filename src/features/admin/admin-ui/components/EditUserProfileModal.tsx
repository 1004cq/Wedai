'use client';

import { Button, createModal, Select, useModalContext } from '@lobehub/ui/base-ui';
import { App, Form, Input } from 'antd';
import { useState } from 'react';

import { adminApi } from '../api';
import { useAdminAccess } from '../hooks/useAdminAccess';
import type { AdminRole, AdminUserRow } from '../types';

interface ProfileFormValues {
  email?: string;
  fullName?: string;
  phone?: string;
  role: Extract<AdminRole, 'admin' | 'user'>;
  username?: string;
}

const EditUserProfileContent = ({
  onSuccess,
  user,
}: {
  onSuccess: () => void;
  user: AdminUserRow;
}) => {
  const { message } = App.useApp();
  const { close } = useModalContext();
  const { can } = useAdminAccess();
  const [submitting, setSubmitting] = useState(false);

  const handleFinish = async (values: ProfileFormValues) => {
    if (!can('user:update')) {
      message.error('当前账号没有编辑用户资料的权限');
      return;
    }

    const email = values.email?.trim() || null;
    const phone = values.phone?.trim() || null;
    if (!email && !phone) {
      message.error('邮箱和手机号至少保留一项，否则用户无法登录');
      return;
    }

    setSubmitting(true);
    try {
      await adminApi.updateUserProfile({
        email,
        fullName: values.fullName?.trim() || null,
        phone,
        role: values.role,
        userId: user.id,
        username: values.username?.trim() || null,
      });
      message.success('用户资料已更新');
      onSuccess();
      close();
    } catch (error) {
      const msg = error instanceof Error ? error.message : '更新用户资料失败';
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form<ProfileFormValues>
      initialValues={{
        email: user.email,
        fullName: user.nickname,
        phone: user.phone,
        role: user.role === 'super_admin' ? 'admin' : user.role,
        username: user.username,
      }}
      layout={'vertical'}
      requiredMark={'optional'}
      onFinish={handleFinish}
    >
      <Form.Item
        extra={'用于邮箱登录。与手机号至少保留一项。'}
        label={'邮箱'}
        name={'email'}
      >
        <Input autoComplete={'off'} placeholder={'user@example.com'} />
      </Form.Item>
      <Form.Item extra={'用于短信登录。国内 11 位手机号。'} label={'手机号'} name={'phone'}>
        <Input autoComplete={'off'} placeholder={'13800138000'} />
      </Form.Item>
      <Form.Item
        extra={'字母、数字或下划线，可空。'}
        label={'用户名'}
        name={'username'}
      >
        <Input autoComplete={'off'} maxLength={64} placeholder={'可选'} />
      </Form.Item>
      <Form.Item label={'昵称'} name={'fullName'}>
        <Input autoComplete={'off'} maxLength={64} placeholder={'显示名称'} />
      </Form.Item>
      <Form.Item
        extra={'admin 可进入本后台。不能取消自己的管理员角色。'}
        label={'角色'}
        name={'role'}
        rules={[{ required: true, message: '请选择角色' }]}
      >
        <Select
          options={[
            { label: 'user（普通用户）', value: 'user' },
            { label: 'admin（管理员）', value: 'admin' },
          ]}
        />
      </Form.Item>
      <Form.Item style={{ marginBottom: 0 }}>
        <Button block htmlType={'submit'} loading={submitting} type={'primary'}>
          保存资料
        </Button>
      </Form.Item>
    </Form>
  );
};

export const createEditUserProfileModal = (user: AdminUserRow, onSuccess: () => void) =>
  createModal({
    content: <EditUserProfileContent user={user} onSuccess={onSuccess} />,
    footer: null,
    maskClosable: false,
    title: `编辑资料 · ${user.nickname || user.id}`,
    width: 'min(92vw, 520px)',
  });
