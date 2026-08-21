import { TRPCError } from '@trpc/server';
import { afterEach, describe, expect, it } from 'vitest';

import {
  assertByokWritesAllowed,
  BYOK_WRITES_DISABLED_MESSAGE,
  isByokAllowed,
} from '../byokPolicy';

describe('byokPolicy', () => {
  const original = process.env.BYOK_ALLOWED;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.BYOK_ALLOWED;
    } else {
      process.env.BYOK_ALLOWED = original;
    }
  });

  it('allows BYOK by default', () => {
    delete process.env.BYOK_ALLOWED;
    expect(isByokAllowed()).toBe(true);
    expect(() => assertByokWritesAllowed()).not.toThrow();
  });

  it('treats non-false values as allowed', () => {
    process.env.BYOK_ALLOWED = 'true';
    expect(isByokAllowed()).toBe(true);
  });

  it('rejects credential writes when BYOK_ALLOWED=false', () => {
    process.env.BYOK_ALLOWED = 'false';
    expect(isByokAllowed()).toBe(false);
    expect(() => assertByokWritesAllowed()).toThrow(TRPCError);
    try {
      assertByokWritesAllowed();
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe('FORBIDDEN');
      expect((error as TRPCError).message).toBe(BYOK_WRITES_DISABLED_MESSAGE);
    }
  });
});
