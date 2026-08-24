import type { AdminUserRow } from './types';

export const parseCreditBalance = (
  value: bigint | number | string | null | undefined,
): number => {
  if (value == null || value === '') return 0;
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : 0;
  }
  const asNumber = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(asNumber) ? asNumber : 0;
};

export const toIsoTimestamp = (value: Date | string): string => {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
};

export const mapAdminUserRow = (row: {
  available?: bigint | number | string | null;
  banned: boolean | null;
  banReason?: string | null;
  createdAt: Date | string;
  email: string | null;
  fullName: string | null;
  id: string;
  phoneNumber?: string | null;
  role: string | null;
  username: string | null;
}): AdminUserRow => ({
  balanceCredits: parseCreditBalance(row.available),
  email: row.email ?? undefined,
  id: row.id,
  lastActiveAt: toIsoTimestamp(row.createdAt),
  nickname: row.fullName ?? row.username ?? row.email ?? row.phoneNumber ?? row.id,
  phone: row.phoneNumber ?? undefined,
  plan: 'free',
  registeredAt: toIsoTimestamp(row.createdAt),
  role: (row.role as AdminUserRow['role']) ?? 'user',
  status: row.banned ? 'banned' : 'active',
  username: row.username ?? undefined,
});
