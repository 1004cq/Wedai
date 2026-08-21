import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Referral from '../Referral';
import Usage from '../Usage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/libs/swr', () => ({
  useClientDataSWR: () => ({
    data: { items: [], nextCursor: null },
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  }),
}));

vi.mock('@/libs/trpc/client', () => ({
  lambdaClient: {
    spend: {
      usageHistory: { query: vi.fn() },
    },
  },
}));

describe('BusinessSettingPages billing shells', () => {
  it('Usage renders a non-null page with empty state', () => {
    const { container } = render(<Usage />);
    expect(container.firstChild).not.toBeNull();
    expect(screen.getByText('usage.title')).toBeTruthy();
    expect(screen.getByText('usage.empty')).toBeTruthy();
  });

  it('Referral renders a coming-soon placeholder instead of null', () => {
    const { container } = render(<Referral />);
    expect(container.firstChild).not.toBeNull();
    expect(screen.getByText('referral.comingSoon')).toBeTruthy();
    expect(screen.getByText('referral.desc')).toBeTruthy();
  });
});
