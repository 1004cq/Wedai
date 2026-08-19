'use client';

import { TRPCClientError } from '@trpc/client';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { lambdaClient } from '@/libs/trpc/client';

import { ROLE_PERMISSIONS } from '../permissions';
import type { AdminPermission, AdminRole } from '../types';

export type AdminAccessState =
  | { status: 'loading' }
  | { role: AdminRole; status: 'ok' }
  | { status: 'forbidden' }
  | { status: 'error'; error: Error };

/**
 * Resolves the calling user's admin role from the server session.
 *
 * Calls admin.users.list with limit=0 (a lightweight probe) — if the server
 * returns FORBIDDEN the user is not an admin.  The resolved role is used only
 * for CLIENT-SIDE permission gates (showing/hiding buttons); every mutation
 * is independently validated by adminProcedure on the server.
 *
 * NOTE: We do NOT read role from localStorage or JWT claims.  The only
 * authoritative source is the server-side DB check in adminProcedure.
 */
export const useAdminAccess = () => {
  const [state, setState] = useState<AdminAccessState>({ status: 'loading' });

  useEffect(() => {
    lambdaClient.admin.users.list
      .query({ cursor: 0, limit: 1 })
      .then(() => {
        // If we can reach this endpoint the server confirmed admin role.
        setState({ role: 'admin', status: 'ok' });
      })
      .catch((err: unknown) => {
        if (
          err instanceof TRPCClientError &&
          (err.data?.code === 'FORBIDDEN' || err.data?.code === 'UNAUTHORIZED')
        ) {
          setState({ status: 'forbidden' });
        } else {
          setState({
            error: err instanceof Error ? err : new Error('Admin access check failed'),
            status: 'error',
          });
        }
      });
  }, []);

  const role: AdminRole = state.status === 'ok' ? state.role : 'user';
  const permissions = useMemo(() => new Set<AdminPermission>(ROLE_PERMISSIONS[role]), [role]);
  const can = useCallback(
    (permission: AdminPermission) => state.status === 'ok' && permissions.has(permission),
    [state.status, permissions],
  );

  return { can, permissions, role, state };
};
