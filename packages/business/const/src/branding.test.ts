import { describe, expect, it } from 'vitest';

import { BRANDING_EMAIL, BRANDING_INBOX_TITLE, BRANDING_NAME } from './branding';

describe('BRANDING_EMAIL', () => {
  it('leaves Reply-To unset by default for self-hosted deployments', () => {
    expect(BRANDING_EMAIL.replyTo).toBeUndefined();
  });
});

describe('BRANDING_INBOX_TITLE', () => {
  it('exports a persona title separate from the product name', () => {
    expect(BRANDING_INBOX_TITLE).toBeTruthy();
    expect(BRANDING_INBOX_TITLE).not.toEqual(BRANDING_NAME);
  });
});
