import { describe, expect, it } from 'vitest';

import { adminUserProfileInputSchema, emptyToNull } from '../userProfileInput';

describe('adminUserProfileInputSchema', () => {
  it('lowercases email and normalizes mainland phone numbers', () => {
    const parsed = adminUserProfileInputSchema.parse({
      email: '  Admin@Example.COM ',
      phoneNumber: '13800138000',
      userId: 'user-1',
    });

    expect(parsed.email).toBe('admin@example.com');
    expect(parsed.phoneNumber).toBe('+8613800138000');
  });

  it('allows clearing username and full name with empty strings', () => {
    const parsed = adminUserProfileInputSchema.parse({
      fullName: '   ',
      userId: 'user-1',
      username: '',
    });

    expect(parsed.username).toBeNull();
  });

  it('rejects a payload with no profile fields', () => {
    const result = adminUserProfileInputSchema.safeParse({ userId: 'user-1' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid emails and phones', () => {
    expect(
      adminUserProfileInputSchema.safeParse({ email: 'not-an-email', userId: 'user-1' }).success,
    ).toBe(false);
    expect(
      adminUserProfileInputSchema.safeParse({ phoneNumber: '12345', userId: 'user-1' }).success,
    ).toBe(false);
  });
});

describe('emptyToNull', () => {
  it('turns blank strings into null and keeps undefined', () => {
    expect(emptyToNull(undefined)).toBeUndefined();
    expect(emptyToNull('  ')).toBeNull();
    expect(emptyToNull('Ada')).toBe('Ada');
  });
});
