'use client';

import { Button } from '@lobehub/ui/base-ui';
import { Result } from 'antd';
import type { PropsWithChildren, ReactNode } from 'react';
import { useNavigate } from 'react-router';

import { useAdminAccess } from '../hooks/useAdminAccess';
import type { AdminPermission } from '../types';

interface AdminGuardProps extends PropsWithChildren {
  fallback?: ReactNode;
  permission: AdminPermission;
}

export const AdminGuard = ({ children, fallback, permission }: AdminGuardProps) => {
  const { can } = useAdminAccess();
  const navigate = useNavigate();

  if (can(permission)) return children;
  if (fallback) return fallback;

  return (
    <Result
      extra={<Button onClick={() => navigate('/')}>返回 Wedai</Button>}
      status={'403'}
      subTitle={'当前账号没有访问此管理功能的权限。'}
      title={'无权访问'}
    />
  );
};
