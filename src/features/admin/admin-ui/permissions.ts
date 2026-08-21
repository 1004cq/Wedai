import type { AdminPermission, AdminRole } from './types';

export const ADMIN_PERMISSIONS = [
  'admin:dashboard:read',
  'user:read',
  'user:update',
  'user:ban',
  'billing:balance:adjust',
  'billing:order:read',
  'billing:order:refund',
  'billing:price:read',
  'billing:price:write',
  'billing:webhook:read',
  'billing:payment:config',
  'system:email:config',
  'system:llm:config',
  'system:sms:config',
  'admin:audit:read',
] as const satisfies readonly AdminPermission[];

export const SUPER_ADMIN_PERMISSIONS = [
  ...ADMIN_PERMISSIONS,
  'role:assign',
] as const satisfies readonly AdminPermission[];

export const ROLE_PERMISSIONS = {
  admin: ADMIN_PERMISSIONS,
  super_admin: SUPER_ADMIN_PERMISSIONS,
  user: [],
} as const satisfies Record<AdminRole, readonly AdminPermission[]>;

export const canRole = (role: AdminRole, permission: AdminPermission): boolean => {
  const permissions: readonly AdminPermission[] = ROLE_PERMISSIONS[role];
  return permissions.includes(permission);
};
