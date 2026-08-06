import { describe, expect, it } from 'vitest';

import { canRole } from './permissions';

describe('Wedai admin permissions', () => {
  it('grants operational permissions to admin without role assignment', () => {
    expect(canRole('admin', 'admin:dashboard:read')).toBe(true);
    expect(canRole('admin', 'billing:payment:config')).toBe(true);
    expect(canRole('admin', 'role:assign')).toBe(false);
  });

  it('reserves role assignment for super admin', () => {
    expect(canRole('super_admin', 'role:assign')).toBe(true);
    expect(canRole('user', 'admin:dashboard:read')).toBe(false);
  });
});
