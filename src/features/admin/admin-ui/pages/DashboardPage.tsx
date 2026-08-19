'use client';

import { Alert } from 'antd';

import { AdminForbiddenBanner, AdminPage } from '../components/AdminPage';
import { useAdminAccess } from '../hooks/useAdminAccess';

export const DashboardPage = () => {
  const { state } = useAdminAccess();

  if (state.status === 'forbidden') return <AdminForbiddenBanner />;

  return (
    <AdminPage description={'运营指标快照。'} title={'运营总览'}>
      <Alert
        showIcon
        description={
          '聚合指标仪表盘（新增用户、今日收入、积分消耗等）尚未实现服务端聚合查询。' +
          '可通过「用户管理」「订单」「账本流水」页面查询具体数据。'
        }
        message={'仪表盘聚合指标 — Phase 2'}
        type={'info'}
      />
    </AdminPage>
  );
};
