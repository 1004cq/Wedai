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
  });
});
