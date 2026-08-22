import { TRPCError } from '@trpc/server';
import { afterEach, describe, expect, it } from 'vitest';

import {
  assertByokWritesAllowed,
  assertPlatformAiSettingsWritable,
  BYOK_WRITES_DISABLED_MESSAGE,
  canWritePlatformAiSettings,
  isByokAllowed,
  omitPlatformAiSettings,
  PLATFORM_AI_ADMIN_ONLY_MESSAGE,
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

  it('allows platform AI defaults for admins when BYOK is off', () => {
    process.env.BYOK_ALLOWED = 'false';
    expect(() => assertPlatformAiSettingsWritable('admin')).not.toThrow();
    expect(canWritePlatformAiSettings('admin')).toBe(true);
  });

  it('rejects platform AI defaults for non-admins when BYOK is off', () => {
    process.env.BYOK_ALLOWED = 'false';
    expect(() => assertPlatformAiSettingsWritable('user')).toThrow(TRPCError);
    expect(canWritePlatformAiSettings('user')).toBe(false);
    try {
      assertPlatformAiSettingsWritable(undefined);
    } catch (error) {
      expect((error as TRPCError).message).toBe(PLATFORM_AI_ADMIN_ONLY_MESSAGE);
    }
  });

  it('omits platform AI fields while keeping unrelated settings', () => {
    expect(
      omitPlatformAiSettings({
        defaultAgent: { config: { model: 'x' } },
        general: { responseLanguage: 'zh-CN' },
        languageModel: { openai: {} },
        systemAgent: { topic: { model: 'y' } },
        telemetry: true,
      }),
    ).toEqual({
      general: { responseLanguage: 'zh-CN' },
      telemetry: true,
    });
  });
});
