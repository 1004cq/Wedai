'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { ROLE_PERMISSIONS } from '../permissions';
import type { AdminPermission, AdminRole } from '../types';

export const ADMIN_PREVIEW_ROLE_KEY = 'WEDAI_ADMIN_ROLE';

const isAdminRole = (value: string | null): value is AdminRole =>
  value === 'admin' || value === 'super_admin' || value === 'user';

const readPreviewRole = (): AdminRole => {
  if (typeof window === 'undefined') return 'user';

  const role = window.localStorage.getItem(ADMIN_PREVIEW_ROLE_KEY);
  return isAdminRole(role) ? role : 'user';
};

/**
 * UI + mock 阶段允许从 localStorage 读取预览角色。
 * 生产环境必须改为读取 Better Auth session 的服务端签名角色；任何服务端写操作仍需重复鉴权。
 */
export const useAdminAccess = () => {
  const [role, setRole] = useState<AdminRole>(readPreviewRole);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === ADMIN_PREVIEW_ROLE_KEY) setRole(readPreviewRole());
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const permissions = useMemo(() => new Set<AdminPermission>(ROLE_PERMISSIONS[role]), [role]);
  const can = useCallback(
    (permission: AdminPermission) => permissions.has(permission),
    [permissions],
  );

  return { can, permissions, role };
};
