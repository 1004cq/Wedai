import { describe, expect, it } from 'vitest';

import { buildAdminConfigStatus } from '../config';

describe('buildAdminConfigStatus', () => {
  it('reports LLM provider configured flags without exposing secrets', () => {
    const status = buildAdminConfigStatus({
      ANTHROPIC_API_KEY: '',
      BYOK_ALLOWED: 'false',
      OPENAI_API_KEY: 'sk-secret-should-not-leak',
      SIGNUP_CREDIT_GRANT: '100',
    });

    expect(status.billing.byokAllowed).toBe(false);
    expect(status.llm.byokAllowed).toBe(false);
    expect(status.billing.signupCreditGrant).toBe(100);
    expect(status.llm.providers.find((p) => p.id === 'openai')?.configured).toBe(true);
    expect(status.llm.providers.find((p) => p.id === 'anthropic')?.configured).toBe(false);
    expect(status.llm.configuredCount).toBeGreaterThanOrEqual(1);

    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain('sk-secret-should-not-leak');
  });

  it('defaults BYOK to allowed when unset', () => {
    const status = buildAdminConfigStatus({});
    expect(status.billing.byokAllowed).toBe(true);
    expect(status.llm.byokAllowed).toBe(true);
  });
});
