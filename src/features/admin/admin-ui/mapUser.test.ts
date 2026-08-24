import { describe, expect, it } from 'vitest';

import { mapAdminUserRow, parseCreditBalance } from './mapUser';

describe('parseCreditBalance', () => {
  it('reads wallet available from list payloads instead of defaulting to zero', () => {
    expect(parseCreditBalance('2500')).toBe(2500);
    expect(parseCreditBalance(2500n)).toBe(2500);
    expect(parseCreditBalance(null)).toBe(0);
  });
});

describe('mapAdminUserRow', () => {
  it('maps wallet available onto the users table balance column', () => {
    const row = mapAdminUserRow({
      available: '12800',
      banned: false,
      createdAt: '2026-08-24T03:08:00.000Z',
      email: '84294924@qq.com',
      fullName: 'cq',
      id: 'user-1',
      phoneNumber: null,
      role: 'user',
      username: 'cq',
    });

    expect(row.balanceCredits).toBe(12_800);
    expect(row.email).toBe('84294924@qq.com');
    expect(row.username).toBe('cq');
  });
});
