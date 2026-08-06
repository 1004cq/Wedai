import { describe, expect, it } from 'vitest';

import { adminMockApi } from './store';

describe('Wedai admin mock API', () => {
  it('supports phone-only users in the full-set search contract', async () => {
    const result = await adminMockApi.listUsers({ page: 1, pageSize: 10, query: '186' });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ phone: '186****2033' });
    expect(result.items[0]).not.toHaveProperty('email');
  });

  it('never returns secrets and treats blank secret updates as no-op', async () => {
    const secretMarker = 'TEST_ONLY_SECRET_MUST_NOT_LEAK';

    const saved = await adminMockApi.updateAlipayConfig({
      alipayPublicKey: secretMarker,
      appId: 'test-app-id',
      enabled: true,
      notifyUrl: 'https://cq.je/api/webhooks/alipay',
      privateKey: secretMarker,
      returnUrl: 'https://cq.je/user-center/billing',
      sandbox: true,
      signType: 'RSA2',
    });
    expect(saved.privateKeyConfigured).toBe(true);
    expect(saved.alipayPublicKeyConfigured).toBe(true);
    expect(saved).not.toHaveProperty('privateKey');
    expect(saved).not.toHaveProperty('alipayPublicKey');

    const blankUpdate = await adminMockApi.updateAlipayConfig({
      alipayPublicKey: '   ',
      appId: saved.appId,
      enabled: saved.enabled,
      notifyUrl: saved.notifyUrl,
      privateKey: '',
      returnUrl: saved.returnUrl,
      sandbox: saved.sandbox,
      signType: 'RSA2',
    });
    expect(blankUpdate.privateKeyConfigured).toBe(true);
    expect(blankUpdate.alipayPublicKeyConfigured).toBe(true);

    const audit = await adminMockApi.listAudit({ page: 1, pageSize: 20 });
    expect(JSON.stringify(audit.items)).not.toContain(secretMarker);
  });

  it('requires a reason for balance and ban mutations', async () => {
    await expect(
      adminMockApi.adjustBalance({ deltaCredits: 100, reason: ' ', userId: 'usr_alice' }),
    ).rejects.toThrow('必须填写操作原因');
    await expect(
      adminMockApi.setUserBan({ banned: true, reason: '', userId: 'usr_alice' }),
    ).rejects.toThrow('必须填写操作原因');
  });
});
