'use client';

import {
  DollarOutlined,
  RiseOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { Card, Col, Row, Statistic } from 'antd';
import { useCallback } from 'react';

import { AdminErrorState, AdminLoading, AdminPage } from '../components/AdminPage';
import { useAdminQuery } from '../hooks/useAdminQuery';
import { adminMockApi } from '../mock/store';
import { formatCredits, formatMinorCurrency } from '../utils';

export const DashboardPage = () => {
  const loader = useCallback(() => adminMockApi.getDashboard(), []);
  const { data, error, isLoading, reload } = useAdminQuery(loader);

  return (
    <AdminPage description={'用户、交易与积分消耗的今日快照。'} title={'运营总览'}>
      {error ? (
        <AdminErrorState error={error} onRetry={reload} />
      ) : isLoading || !data ? (
        <AdminLoading />
      ) : (
        <Row gutter={[16, 16]}>
          <Col lg={8} sm={12} xs={24}>
            <Card>
              <Statistic prefix={<TeamOutlined />} title={'用户总数'} value={data.totalUsers} />
            </Card>
          </Col>
          <Col lg={8} sm={12} xs={24}>
            <Card>
              <Statistic
                prefix={<UserAddOutlined />}
                title={'今日新增'}
                value={data.newUsersToday}
              />
            </Card>
          </Col>
          <Col lg={8} sm={12} xs={24}>
            <Card>
              <Statistic
                prefix={<ShoppingCartOutlined />}
                title={'今日已付订单'}
                value={data.paidOrdersToday}
              />
            </Card>
          </Col>
          <Col lg={8} sm={12} xs={24}>
            <Card>
              <Statistic
                prefix={<DollarOutlined />}
                title={'今日收入'}
                value={formatMinorCurrency(data.revenueTodayMinor)}
              />
            </Card>
          </Col>
          <Col lg={8} sm={12} xs={24}>
            <Card>
              <Statistic
                prefix={<RiseOutlined />}
                title={'今日发放积分'}
                value={formatCredits(data.creditsGrantedToday)}
              />
            </Card>
          </Col>
          <Col lg={8} sm={12} xs={24}>
            <Card>
              <Statistic
                prefix={<ThunderboltOutlined />}
                title={'今日消耗积分'}
                value={formatCredits(data.creditsConsumedToday)}
              />
            </Card>
          </Col>
        </Row>
      )}
    </AdminPage>
  );
};
