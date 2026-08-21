import { describe, expect, it } from 'vitest';

import { dockerSwcHelpersTracingIncludes } from '../dockerSwcHelpersTracingIncludes';

describe('dockerSwcHelpersTracingIncludes', () => {
  it('force-includes full @swc/helpers for Docker standalone tracing', () => {
    expect(dockerSwcHelpersTracingIncludes).toEqual(
      expect.arrayContaining([
        'node_modules/@swc/helpers/**/*',
        'node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/**/*',
      ]),
    );
  });
});
