import { describe, expect, it } from 'vitest';

import { defineConfig } from './define-config';
import { dockerCanvasTracingIncludes } from './dockerCanvasTracingIncludes';
import { dockerSwcHelpersTracingIncludes } from './dockerSwcHelpersTracingIncludes';

describe('defineConfig', () => {
  it('disables Next.js agent rule injection', () => {
    expect(defineConfig({}).agentRules).toBe(false);
  });
});

describe('dockerCanvasTracingIncludes', () => {
  it('keeps Docker canvas tracing away from pnpm symlink directories', () => {
    expect(dockerCanvasTracingIncludes).toContain('node_modules/@napi-rs/canvas/**/*');
    expect(dockerCanvasTracingIncludes).toContain('node_modules/@napi-rs/canvas-*/package.json');
    expect(dockerCanvasTracingIncludes).toContain('node_modules/@napi-rs/canvas-*/*.node');
    expect(dockerCanvasTracingIncludes).toContain(
      'node_modules/.pnpm/@napi-rs+canvas-*/node_modules/@napi-rs/canvas-*/package.json',
    );
    expect(dockerCanvasTracingIncludes).toContain(
      'node_modules/.pnpm/@napi-rs+canvas-*/node_modules/@napi-rs/canvas-*/*.node',
    );
    expect(dockerCanvasTracingIncludes).not.toContain('node_modules/@napi-rs/canvas-*/**/*');
    expect(dockerCanvasTracingIncludes).not.toContain('node_modules/.pnpm/@napi-rs+canvas*/**/*');
    expect(dockerCanvasTracingIncludes).not.toContain('node_modules/.pnpm/@napi-rs+canvas-*/**/*');
  });
});

describe('dockerSwcHelpersTracingIncludes', () => {
  it('force-includes full @swc/helpers for Docker standalone tracing', () => {
    expect(dockerSwcHelpersTracingIncludes).toContain('node_modules/@swc/helpers/**/*');
    expect(dockerSwcHelpersTracingIncludes).toContain(
      'node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/**/*',
    );
  });
});
