'use client';

import { Flexbox, Text } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { useCallback } from 'react';

import { AdminForbiddenBanner, AdminPage } from '../components/AdminPage';
import { useAdminAccess } from '../hooks/useAdminAccess';
import { useAdminQuery } from '../hooks/useAdminQuery';
import { adminApi } from '../api';
import StatisticCard from '@/components/StatisticCard';
import type { AdminDashboardMetrics } from '../types';
import { formatCredits } from '../utils';

const styles = createStaticStyles({
  wrapper: {
    maxWidth: 900,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 16,
  },
});

export const DashboardPage = () => {
  const { state } = useAdminAccess();

  if (state.status === 'forbidden') return <AdminForbiddenBanner />;

  const loader = useCallback(() => adminApi.dashboardSummary(), []);
  const { data, error, isLoading, reload } = useAdminQuery<AdminDashboardMetrics>(loader);

  return (
    <AdminPage
      description={'运营指标快照。来源为服务端聚合查询（只读）。'}
      title={'运营总览'}
    >
      <div className={styles.wrapper}>
        {error ? (
          // Reuse the same UI convention as other admin pages
          <Flexbox horizontal align={'center'} gap={12}>
            <Text type={'danger'}>{error.message}</Text>
            <Text
              as={'a'}
              style={{ cursor: 'pointer', color: cssVar.colorPrimary }}
              onClick={reload}
            >
              重新加载
            </Text>
          </Flexbox>
        ) : (
          <div className={styles.grid}>
            <StatisticCard
              loading={isLoading}
              variant={'borderless'}
              padding={20}
              title={'新增用户（今日）'}
              statistic={{ value: data?.newUsersToday ?? 0, precision: 0 }}
            />
            <StatisticCard
              loading={isLoading}
              variant={'borderless'}
              padding={20}
              title={'已支付订单（今日）'}
              statistic={{ value: data?.paidOrdersToday ?? 0, precision: 0 }}
            />
            <StatisticCard
              loading={isLoading}
              variant={'borderless'}
              padding={20}
              title={'今日收入（订单金额）'}
              statistic={{
                value: data ? Number(data.revenueTodayMinor) / 100 : 0,
                precision: 2,
                prefix: '¥',
              }}
              extra={<Text type={'secondary'}>{data ? '币种：CNY' : '—'}</Text>}
            />
            <StatisticCard
              loading={isLoading}
              variant={'borderless'}
              padding={20}
              title={'积分消耗（今日，已结算）'}
              statistic={{ value: data?.creditsConsumedToday ?? 0, precision: 0 }}
              extra={<Text type={'secondary'}>{data ? formatCredits(data.creditsConsumedToday) : ''}</Text>}
            />
            <StatisticCard
              loading={isLoading}
              variant={'borderless'}
              padding={20}
              title={'积分发放（今日，grant）'}
              statistic={{ value: data?.creditsGrantedToday ?? 0, precision: 0 }}
              extra={<Text type={'secondary'}>{data ? formatCredits(data.creditsGrantedToday) : ''}</Text>}
            />
            <StatisticCard
              loading={isLoading}
              variant={'borderless'}
              padding={20}
              title={'总用户数'}
              statistic={{ value: data?.totalUsers ?? 0, precision: 0 }}
            />
          </div>
        )}
      </div>
    </AdminPage>
  );
};
