'use client';

import type { TableColumnsType } from 'antd';
import { Empty, Grid, Input, Table, Tag, Typography } from 'antd';
import { useCallback, useState } from 'react';

import { adminApi } from '../api';
import { AdminErrorState, AdminForbiddenBanner, AdminPage } from '../components/AdminPage';
import { AdminScrollSurface } from '../components/AdminScrollSurface';
import { useAdminAccess } from '../hooks/useAdminAccess';
import { useAdminQuery } from '../hooks/useAdminQuery';
import { formatDateTime } from '../utils';

const DEFAULT_PAGE_SIZE = 20;

interface LedgerRow {
  balanceAfter: bigint;
  billingAccountId: string;
  createdAt: Date;
  delta: bigint;
  id: string;
  idempotencyKey: string;
  kind: string;
  operatorUserId: string | null;
  orderId: string | null;
  reason: string | null;
  usageRecordId: string | null;
}

const useAuditPage = (billingAccountId: string) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const loader = useCallback(
    () =>
      billingAccountId.trim()
        ? adminApi.listLedger({ billingAccountId: billingAccountId.trim(), page, pageSize })
        : Promise.resolve({ items: [], nextCursor: null }),
    [billingAccountId, page, pageSize],
  );
  const queryState = useAdminQuery(loader);
  return { page, pageSize, setPage, setPageSize, ...queryState };
};

export const AuditPage = () => {
  const { state } = useAdminAccess();
  const screens = Grid.useBreakpoint();
  const [billingAccountId, setBillingAccountId] = useState('');
  const { data, error, isLoading, page, pageSize, reload, setPage, setPageSize } =
    useAuditPage(billingAccountId);

  if (state.status === 'forbidden') return <AdminForbiddenBanner />;

  const columns: TableColumnsType<LedgerRow> = [
    { dataIndex: 'kind', render: (kind: string) => <Tag>{kind}</Tag>, title: '类型' },
    {
      dataIndex: 'delta',
      render: (v: bigint) => {
        const n = Number(v);
        return (
          <Typography.Text type={n >= 0 ? 'success' : 'danger'}>
            {n >= 0 ? `+${n.toLocaleString()}` : n.toLocaleString()}
          </Typography.Text>
        );
      },
      title: '变动积分',
    },
    {
      dataIndex: 'balanceAfter',
      render: (v: bigint) => Number(v).toLocaleString(),
      title: '操作后余额',
    },
    { dataIndex: 'reason', render: (v?: string | null) => v || '—', title: '原因' },
    {
      dataIndex: 'operatorUserId',
      render: (v?: string | null) => v || '—',
      title: '操作人',
    },
    {
      dataIndex: 'idempotencyKey',
      render: (v: string) => (
        <Typography.Text code copyable style={{ fontSize: 11 }}>
          {v}
        </Typography.Text>
      ),
      title: '幂等键',
    },
    { dataIndex: 'createdAt', render: (v: Date) => formatDateTime(v.toISOString()), title: '时间' },
  ];

  const items: LedgerRow[] = (data?.items ?? []) as LedgerRow[];
  const total =
    data?.nextCursor !== null
      ? (page - 1) * pageSize + items.length + 1
      : (page - 1) * pageSize + items.length;

  return (
    <AdminPage
      description={'不可变账本流水。按 Billing Account ID 查询；所有余额变化均有对应条目。'}
      title={'账本流水（Audit）'}
    >
      <Input.Search
        allowClear
        enterButton={'查询'}
        placeholder={'输入 Billing Account ID（bac_xxx）'}
        style={{ maxWidth: 480, width: '100%' }}
        value={billingAccountId}
        onChange={(e) => setBillingAccountId(e.target.value)}
        onSearch={(value) => {
          setBillingAccountId(value.trim());
          setPage(1);
        }}
      />
      {!billingAccountId.trim() && <Empty description={'请输入 Billing Account ID 查询流水'} />}
      {billingAccountId.trim() && (
        <>
          {error ? (
            <AdminErrorState error={error} onRetry={reload} />
          ) : (
            <AdminScrollSurface>
              <Table<LedgerRow>
                columns={columns}
                dataSource={items}
                loading={isLoading}
                locale={{ emptyText: <Empty description={'该账户暂无流水'} /> }}
                rowKey={'id'}
                scroll={{ x: 800 }}
                pagination={{
                  current: page,
                  pageSize,
                  showSizeChanger: !!screens.md,
                  simple: !screens.md,
                  total,
                  onChange: (nextPage, nextPageSize) => {
                    setPage(nextPageSize === pageSize ? nextPage : 1);
                    setPageSize(nextPageSize);
                  },
                }}
              />
            </AdminScrollSurface>
          )}
        </>
      )}
    </AdminPage>
  );
};
