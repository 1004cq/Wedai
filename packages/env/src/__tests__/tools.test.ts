// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('getToolsConfig SEARXNG_URL', () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env.SEARXNG_URL;
  });

  it('treats empty string as unset (core profile)', async () => {
    process.env.SEARXNG_URL = '';
    const { getToolsConfig } = await import('../tools');
    expect(getToolsConfig().SEARXNG_URL).toBeUndefined();
  });

  it('accepts a valid SearXNG URL', async () => {
    process.env.SEARXNG_URL = 'http://searxng:8080';
    const { getToolsConfig } = await import('../tools');
    expect(getToolsConfig().SEARXNG_URL).toBe('http://searxng:8080');
  });
});
