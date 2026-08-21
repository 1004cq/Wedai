'use client';

import { Flexbox, Text } from '@lobehub/ui';
import { Button } from '@lobehub/ui/base-ui';
import type { TableColumnsType } from 'antd';
import { Empty, Flex, Grid, Input, Pagination, Space, Table, Tag } from 'antd';
import { useCallback, useState } from 'react';

import { adminApi } from '../api';
import { createAdjustBalanceModal } from '../components/AdjustBalanceModal';
import { AdminErrorState, AdminForbiddenBanner, AdminPage } from '../components/AdminPage';
import { adminMobileListStyles, AdminScrollSurface } from '../components/AdminScrollSurface';
import { createUserBanModal } from '../components/UserBanModal';
import { useAdminAccess } from '../hooks/useAdminAccess';
import { useAdminQuery } from '../hooks/useAdminQuery';
import type { AdminUserRow } from '../types';
import { formatCredits, formatDateTime } from '../utils';

const DEFAULT_PAGE_SIZE = 10;

const useUsersPage = () => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [query, setQuery] = useState('');
  const loader = useCallback(
    () => adminApi.listUsers({ page, pageSize, query }),
    [page, pageSize, query],
  );
  const queryState = useAdminQuery(loader);

  return { page, pageSize, query, setPage, setPageSize, setQuery, ...queryState };
};

const UserActions = ({ user, onReload }: { onReload: () => void; user: AdminUserRow }) => {
  const { can } = useAdminAccess();

  return (
    <Space wrap size={4}>
      {can('billing:balance:adjust') && (
        <Button size={'small'} onClick={() => createAdjustBalanceModal(user, onReload)}>
          调整余额
        </Button>
      )}
      {can('user:ban') && (
        <Button
          danger={user.status !== 'banned'}
          size={'small'}
          type={'text'}
          onClick={() => createUserBanModal(user, onReload)}
        >
          {user.status === 'banned' ? '解封' : '封禁'}
        </Button>
      )}
    </Space>
  );
};

export const UsersPage = () => {
  const { state } = useAdminAccess();
  const screens = Grid.useBreakpoint();
  const isCompact = !screens.md;
  const { data, error, isLoading, page, pageSize, query, reload, setPage, setPageSize, setQuery } =
    useUsersPage();

  if (state.status === 'forbidden') return <AdminForbiddenBanner />;

  const columns: TableColumnsType<AdminUserRow> = [
    {
      dataIndex: 'email',
      render: (_, user) => user.email || '—',
      title: '邮箱',
    },
    { dataIndex: 'phone', render: (phone?: string) => phone || '—', title: '手机号' },
    {
      dataIndex: 'nickname',
      render: (_, user) => user.nickname || user.id,
      title: '昵称 / 用户名',
    },
    { dataIndex: 'role', render: (role: string) => <Tag>{role ?? '—'}</Tag>, title: '角色' },
    {
      dataIndex: 'status',
      render: (status: AdminUserRow['status']) => (
        <Tag color={status === 'active' ? 'success' : 'error'}>
          {status === 'active' ? '正常' : '已封禁'}
        </Tag>
      ),
      title: '状态',
    },
    {
      align: 'right',
      dataIndex: 'balanceCredits',
      render: (v: number) => formatCredits(v),
      title: '可用积分',
    },
    { dataIndex: 'registeredAt', render: formatDateTime, title: '注册时间' },
    {
      fixed: 'right',
      render: (_, user) => <UserActions user={user} onReload={reload} />,
      title: '操作',
    },
  ];

  return (
    <AdminPage description={'支持邮箱、用户名双通道账号搜索。'} title={'用户管理'}>
      <Flex gap={12} style={{ maxWidth: '100%', width: '100%' }} wrap={'wrap'}>
        <Input.Search
          allowClear
          defaultValue={query}
          placeholder={'搜索邮箱 / 用户名 / 姓名'}
          style={{
            flex: '1 1 240px',
            maxWidth: isCompact ? '100%' : 360,
            minWidth: 0,
            width: '100%',
          }}
          onSearch={(value) => {
            setPage(1);
            setQuery(value.trim());
          }}
        />
      </Flex>
      {error ? (
        <AdminErrorState error={error} onRetry={reload} />
      ) : isCompact ? (
        <Flexbox className={adminMobileListStyles.cardList}>
          {isLoading && !data ? (
            <Text type={'secondary'}>加载中…</Text>
          ) : !data?.items?.length ? (
            <Empty description={'没有匹配的用户'} />
          ) : (
            data.items.map((user) => (
              <div className={adminMobileListStyles.card} key={user.id}>
                <Flexbox gap={4}>
                  <Text strong style={{ wordBreak: 'break-word' }}>
                    {user.email || user.phone || user.nickname || user.id}
                  </Text>
                  <Text style={{ fontSize: 12, wordBreak: 'break-all' }} type={'secondary'}>
                    {user.nickname || user.id}
                  </Text>
                </Flexbox>
                <div className={adminMobileListStyles.cardMeta}>
                  <Tag>{user.role ?? '—'}</Tag>
                  <Tag color={user.status === 'active' ? 'success' : 'error'}>
                    {user.status === 'active' ? '正常' : '已封禁'}
                  </Tag>
                  <span>积分 {formatCredits(user.balanceCredits)}</span>
                  <span>{formatDateTime(user.registeredAt)}</span>
                </div>
                <div className={adminMobileListStyles.cardActions}>
                  <UserActions user={user} onReload={reload} />
                </div>
              </div>
            ))
          )}
          <Pagination
            simple
            current={page}
            pageSize={pageSize}
            style={{ alignSelf: 'center' }}
            total={data?.total}
            onChange={(nextPage, nextPageSize) => {
              setPage(nextPageSize === pageSize ? nextPage : 1);
              setPageSize(nextPageSize);
            }}
          />
        </Flexbox>
      ) : (
        <AdminScrollSurface>
          <Table<AdminUserRow>
            columns={columns}
            dataSource={data?.items}
            loading={isLoading}
            locale={{ emptyText: <Empty description={'没有匹配的用户'} /> }}
            rowKey={'id'}
            scroll={{ x: 960 }}
            pagination={{
              current: page,
              pageSize,
              showSizeChanger: true,
              total: data?.total,
              onChange: (nextPage, nextPageSize) => {
                setPage(nextPageSize === pageSize ? nextPage : 1);
                setPageSize(nextPageSize);
              },
            }}
          />
        </AdminScrollSurface>
      )}
    </AdminPage>
  );
};
