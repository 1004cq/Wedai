'use client';

import { Select } from '@lobehub/ui/base-ui';
import type { TableColumnsType } from 'antd';
import { Empty, Grid, Table, Tag } from 'antd';
import { useCallback, useState } from 'react';

import { AdminErrorState, AdminPage } from '../components/AdminPage';
import { useAdminQuery } from '../hooks/useAdminQuery';
import { adminMockApi } from '../mock/store';
import type { AdminOrderRow, AdminOrderStatus } from '../types';
import { formatCredits, formatDateTime, formatMinorCurrency } from '../utils';

const DEFAULT_PAGE_SIZE = 10;

export const OrdersPage = () => {
  const screens = Grid.useBreakpoint();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [status, setStatus] = useState<AdminOrderStatus>();
  const loader = useCallback(
    () => adminMockApi.listOrders({ page, pageSize, status }),
    [page, pageSize, status],
  );
  const { data, error, isLoading, reload } = useAdminQuery(loader);

  const columns: TableColumnsType<AdminOrderRow> = [
    { dataIndex: 'orderNo', title: '订单号' },
    { dataIndex: 'userDisplay', title: '用户' },
    {
      dataIndex: 'type',
      render: (type: AdminOrderRow['type']) => (type === 'subscription' ? '订阅套餐' : '积分包'),
      title: '类型',
    },
    {
      dataIndex: 'status',
      render: (value: AdminOrderStatus) => {
        const colors: Record<AdminOrderStatus, string> = {
          closed: 'default',
          failed: 'error',
          paid: 'success',
          pending: 'processing',
        };
        return <Tag color={colors[value]}>{value}</Tag>;
      },
      title: '状态',
    },
    { align: 'right', dataIndex: 'amountMinor', render: formatMinorCurrency, title: '金额' },
    { align: 'right', dataIndex: 'credits', render: formatCredits, title: '积分' },
    { dataIndex: 'paymentProvider', title: '支付渠道' },
    { dataIndex: 'createdAt', render: formatDateTime, title: '时间' },
  ];

  return (
    <AdminPage description={'查看订阅与积分包订单，状态筛选由服务端查询形状承载。'} title={'订单'}>
      <Select
        allowClear
        placeholder={'按状态筛选'}
        style={{ width: 200 }}
        value={status}
        options={[
          { label: '待支付', value: 'pending' },
          { label: '已支付', value: 'paid' },
          { label: '已关闭', value: 'closed' },
          { label: '失败', value: 'failed' },
        ]}
        onChange={(value) => {
          setPage(1);
          setStatus(value as AdminOrderStatus | undefined);
        }}
      />
      {error ? (
        <AdminErrorState error={error} onRetry={reload} />
      ) : (
        <Table<AdminOrderRow>
          columns={columns}
          dataSource={data?.items}
          loading={isLoading}
          locale={{ emptyText: <Empty description={'没有匹配的订单'} /> }}
          rowKey={'id'}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: page,
            pageSize,
            showSizeChanger: !!screens.md,
            simple: !screens.md,
            total: data?.total,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPageSize === pageSize ? nextPage : 1);
              setPageSize(nextPageSize);
            },
          }}
        />
      )}
    </AdminPage>
  );
};
