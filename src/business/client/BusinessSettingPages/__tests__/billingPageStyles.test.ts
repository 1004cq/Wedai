import { describe, expect, it } from 'vitest';

/**
 * Regression: createStaticStyles does not provide `token`.
 * Using token.xxx crashes at module load → white screen for Plans/Credits/Billing.
 */
describe('billingPageStyles', () => {
  it('loads without throwing (cssVar-based createStaticStyles)', async () => {
    await expect(import('../billingPageStyles')).resolves.toMatchObject({
      billingPageStyles: expect.objectContaining({
        card: expect.any(String),
        title: expect.any(String),
        wrapper: expect.any(String),
      }),
    });
  });

  it('Plans/Credits/Billing modules load without style-token crash', async () => {
    await expect(import('../Plans')).resolves.toBeTruthy();
    await expect(import('../Credits')).resolves.toBeTruthy();
    await expect(import('../Billing')).resolves.toBeTruthy();
    await expect(import('../Usage')).resolves.toBeTruthy();
    await expect(import('../Referral')).resolves.toBeTruthy();
  });
});
