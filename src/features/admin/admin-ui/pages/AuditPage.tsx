'use client';

import type { TableColumnsType } from 'antd';
import { Empty, Grid, Input, Table, Tag, Typography } from 'antd';
import { useCallback, useState } from 'react';

import { AdminErrorState, AdminPage } from '../components/AdminPage';
import { useAdminQuery } from '../hooks/useAdminQuery';
import { adminMockApi } from '../mock/store';
import type { AuditLog } from '../types';
import { formatDateTime } from '../utils';

const DEFAULT_PAGE_SIZE = 10;

export const AuditPage = () => {
  const screens = Grid.useBreakpoint();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [query, setQuery] = useState('');
  const loader = useCallback(
    () => adminMockApi.listAudit({ page, pageSize, query }),
    [page, pageSize, query],
  );
  const { data, error, isLoading, reload } = useAdminQuery(loader);

  const columns: TableColumnsType<AuditLog> = [
    { dataIndex: 'actor', title: '操作人' },
    { dataIndex: 'action', render: (action: string) => <Tag>{action}</Tag>, title: 'Action' },
    { dataIndex: 'targetType', title: '目标类型' },
    { dataIndex: 'targetId', title: '目标 ID' },
    { dataIndex: 'reason', title: '原因' },
    {
      dataIndex: 'metadata',
      render: (metadata: AuditLog['metadata']) => (
        <Typography.Text code>{JSON.stringify(metadata)}</Typography.Text>
      ),
      title: 'Metadata',
    },
    { dataIndex: 'createdAt', render: formatDateTime, title: '时间' },
  ];

  return (
    <AdminPage
      description={'记录调余额、封禁、价格与敏感配置变更；日志不包含密钥明文。'}
      title={'操作日志'}
    >
      <Input.Search
        allowClear
        placeholder={'搜索操作人 / action / 目标 / 原因'}
        style={{ maxWidth: 400, width: '100%' }}
        onSearch={(value) => {
          setPage(1);
          setQuery(value.trim());
        }}
      />
      {error ? (
        <AdminErrorState error={error} onRetry={reload} />
      ) : (
        <Table<AuditLog>
          columns={columns}
          dataSource={data?.items}
          loading={isLoading}
          locale={{ emptyText: <Empty description={'暂无操作日志'} /> }}
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
