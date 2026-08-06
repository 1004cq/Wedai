'use client';

import { Button } from '@lobehub/ui/base-ui';
import type { TableColumnsType } from 'antd';
import { Empty, Flex, Grid, Input, Space, Table, Tag } from 'antd';
import { useCallback, useState } from 'react';

import { createAdjustBalanceModal } from '../components/AdjustBalanceModal';
import { AdminErrorState, AdminPage } from '../components/AdminPage';
import { createUserBanModal } from '../components/UserBanModal';
import { useAdminAccess } from '../hooks/useAdminAccess';
import { useAdminQuery } from '../hooks/useAdminQuery';
import { adminMockApi } from '../mock/store';
import type { AdminUserRow } from '../types';
import { formatCredits, formatDateTime } from '../utils';

const DEFAULT_PAGE_SIZE = 10;

const useUsersPage = () => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [query, setQuery] = useState('');
  const loader = useCallback(
    () => adminMockApi.listUsers({ page, pageSize, query }),
    [page, pageSize, query],
  );
  const queryState = useAdminQuery(loader);

  return { page, pageSize, query, setPage, setPageSize, setQuery, ...queryState };
};

export const UsersPage = () => {
  const { can } = useAdminAccess();
  const screens = Grid.useBreakpoint();
  const { data, error, isLoading, page, pageSize, query, reload, setPage, setPageSize, setQuery } =
    useUsersPage();

  const columns: TableColumnsType<AdminUserRow> = [
    {
      dataIndex: 'email',
      render: (_, user) => user.email || '—',
      title: '邮箱',
    },
    { dataIndex: 'phone', render: (phone?: string) => phone || '—', title: '手机号' },
    { dataIndex: 'nickname', title: '昵称' },
    { dataIndex: 'role', render: (role: string) => <Tag>{role}</Tag>, title: '角色' },
    {
      dataIndex: 'status',
      render: (status: AdminUserRow['status']) => (
        <Tag color={status === 'active' ? 'success' : 'error'}>
          {status === 'active' ? '正常' : '已封禁'}
        </Tag>
      ),
      title: '状态',
    },
    { dataIndex: 'plan', render: (plan: string) => <Tag>{plan}</Tag>, title: '套餐' },
    {
      align: 'right',
      dataIndex: 'balanceCredits',
      render: formatCredits,
      title: '可用积分',
    },
    { dataIndex: 'registeredAt', render: formatDateTime, title: '注册时间' },
    { dataIndex: 'lastActiveAt', render: formatDateTime, title: '最近活跃' },
    {
      fixed: screens.lg ? 'right' : undefined,
      render: (_, user) => (
        <Space size={4}>
          {can('billing:balance:adjust') && (
            <Button size={'small'} onClick={() => createAdjustBalanceModal(user, reload)}>
              调整余额
            </Button>
          )}
          {can('user:ban') && (
            <Button
              danger={user.status !== 'banned'}
              size={'small'}
              type={'text'}
              onClick={() => createUserBanModal(user, reload)}
            >
              {user.status === 'banned' ? '解封' : '封禁'}
            </Button>
          )}
        </Space>
      ),
      title: '操作',
    },
  ];

  return (
    <AdminPage
      description={'支持邮箱、手机号双通道账号；搜索覆盖邮箱、手机号和昵称。'}
      title={'用户管理'}
    >
      <Flex gap={12} wrap={'wrap'}>
        <Input.Search
          allowClear
          defaultValue={query}
          placeholder={'搜索邮箱 / 手机号 / 昵称'}
          style={{ maxWidth: 360, width: '100%' }}
          onSearch={(value) => {
            setPage(1);
            setQuery(value.trim());
          }}
        />
      </Flex>
      {error ? (
        <AdminErrorState error={error} onRetry={reload} />
      ) : (
        <Table<AdminUserRow>
          columns={columns}
          dataSource={data?.items}
          loading={isLoading}
          locale={{ emptyText: <Empty description={'没有匹配的用户'} /> }}
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
