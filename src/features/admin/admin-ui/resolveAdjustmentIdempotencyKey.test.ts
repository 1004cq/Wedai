import { describe, expect, it } from 'vitest';

import { resolveAdjustmentIdempotencyKey } from './resolveAdjustmentIdempotencyKey';

describe('resolveAdjustmentIdempotencyKey', () => {
  it('does not throw when the optional form field is undefined', () => {
    expect(resolveAdjustmentIdempotencyKey(undefined, 'user-1', 1_700_000_000_000)).toBe(
      'admin-1700000000000-user-1',
    );
  });

  it('treats blank strings as missing and auto-generates a key', () => {
    expect(resolveAdjustmentIdempotencyKey('   ', 'user-1', 42)).toBe('admin-42-user-1');
  });

  it('keeps an explicit operator-provided key', () => {
    expect(resolveAdjustmentIdempotencyKey('  op-batch-9  ', 'user-1')).toBe('op-batch-9');
  });
});
