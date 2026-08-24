import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Regression: admin tables used `scroll.x = max-content` without a viewport-bounded
 * shell, so phones saw a desktop-wide page (tiny / horizontally overflowing).
 */
describe('admin mobile containment markers', () => {
  it('AdminLayout CSS keeps the shell within the viewport', () => {
    const text = readFileSync(path.resolve(here, 'components/AdminLayout.tsx'), 'utf8');

    expect(text).toContain('max-width: 100vw');
    expect(text).toContain('overflow-x: hidden');
    expect(text).toContain('min-width: 0');
  });

  it('AdminScrollSurface contains table overflow', () => {
    const text = readFileSync(path.resolve(here, 'components/AdminScrollSurface.tsx'), 'utf8');

    expect(text).toContain('overflow-x: auto');
    expect(text).toContain('max-width: 100%');
  });

  it('UsersPage uses a compact card list below the md breakpoint', () => {
    const text = readFileSync(path.resolve(here, 'pages/UsersPage.tsx'), 'utf8');

    expect(text).toContain('isCompact');
    expect(text).toContain('adminMobileListStyles.card');
    expect(text).toContain('AdminScrollSurface');
    expect(text).toContain('编辑资料');
    expect(text).toContain('createEditUserProfileModal');
  });

  it('admin credit submit survives an empty optional idempotency key', () => {
    const modal = readFileSync(path.resolve(here, 'components/AdjustBalanceModal.tsx'), 'utf8');
    const helper = readFileSync(path.resolve(here, 'resolveAdjustmentIdempotencyKey.ts'), 'utf8');

    expect(modal).toContain('resolveAdjustmentIdempotencyKey');
    expect(modal).not.toMatch(/idempotencyKey\.trim\(\)/);
    expect(helper).toContain('idempotencyKey?.trim()');
  });

  it('admin users list joins wallets so recharge is visible after reload', () => {
    const usersRouter = readFileSync(
      path.resolve(here, '../../../../apps/server/src/routers/lambda/admin/routers/users.ts'),
      'utf8',
    );
    const mapper = readFileSync(path.resolve(here, 'mapUser.ts'), 'utf8');
    const adjustments = readFileSync(
      path.resolve(
        here,
        '../../../../apps/server/src/routers/lambda/admin/routers/adjustments.ts',
      ),
      'utf8',
    );

    expect(usersRouter).toContain('leftJoin(wallets');
    expect(usersRouter).toContain('ensureBillingAccount');
    expect(mapper).toContain('parseCreditBalance(row.available)');
    expect(adjustments).toContain('buildManualCreditCommand');
    expect(adjustments).not.toContain('admin-adj-');
  });

  it('ProvidersPage is an editable LLM secret surface that never echoes plaintext', () => {
    const page = readFileSync(path.resolve(here, 'pages/ProvidersPage.tsx'), 'utf8');
    const layout = readFileSync(path.resolve(here, 'components/AdminLayout.tsx'), 'utf8');
    const app = readFileSync(path.resolve(here, 'AdminApp.tsx'), 'utf8');
    const api = readFileSync(path.resolve(here, 'api.ts'), 'utf8');

    expect(page).toContain('getConfigStatus');
    expect(page).toContain('updateLlmProvider');
    expect(page).toContain('永不回显密钥明文');
    expect(page).toContain('留空不会覆盖已有密钥');
    expect(api).toContain('updateLlmProvider');
    expect(layout).toContain('/admin/providers');
    expect(layout).toContain('system:llm:config');
    expect(app).toContain('ProvidersPage');
  });
});
