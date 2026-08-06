'use client';

import {
  AuditOutlined,
  CreditCardOutlined,
  DashboardOutlined,
  MailOutlined,
  MenuOutlined,
  MoneyCollectOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Drawer, Flexbox, Text } from '@lobehub/ui';
import { Button } from '@lobehub/ui/base-ui';
import type { MenuProps } from 'antd';
import { Grid, Layout, Menu, Tag } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import type { PropsWithChildren, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router';

import { useAdminAccess } from '../hooks/useAdminAccess';
import type { AdminPermission } from '../types';

const { Content, Header, Sider } = Layout;
const ADMIN_SIDER_WIDTH = 220;
const ADMIN_DRAWER_WIDTH = 260;

const styles = createStaticStyles(({ css }) => ({
  app: css`
    min-height: 100dvh;
    background: ${cssVar.colorBgLayout};
  `,
  brandLogo: css`
    width: 32px;
    height: 32px;
    border-radius: ${cssVar.borderRadius};
    object-fit: cover;
  `,
  content: css`
    box-sizing: border-box;
    width: 100%;
    max-width: 1600px;
    margin-inline: auto;
  `,
  drawerBody: css`
    padding: 12px;
    background: ${cssVar.colorBgLayout};
  `,
  header: css`
    position: sticky;
    z-index: 20;
    inset-block-start: 0;

    height: 64px;
    padding-inline: 16px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    line-height: normal;

    background: ${cssVar.colorBgContainer};
  `,
  menu: css`
    border-inline-end: 0 !important;
    background: transparent;
  `,
  sider: css`
    position: sticky !important;
    inset-block-start: 0;

    overflow: auto;

    height: 100dvh;
    border-inline-end: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgContainer} !important;
  `,
}));

interface AdminMenuDefinition {
  icon: ReactNode;
  label: string;
  path: string;
  permission: AdminPermission;
}

const MENU_DEFINITIONS: AdminMenuDefinition[] = [
  {
    icon: <DashboardOutlined />,
    label: '运营总览',
    path: '/admin',
    permission: 'admin:dashboard:read',
  },
  { icon: <TeamOutlined />, label: '用户管理', path: '/admin/users', permission: 'user:read' },
  {
    icon: <ShoppingCartOutlined />,
    label: '订单',
    path: '/admin/orders',
    permission: 'billing:order:read',
  },
  {
    icon: <MoneyCollectOutlined />,
    label: '模型价格',
    path: '/admin/prices',
    permission: 'billing:price:read',
  },
  {
    icon: <CreditCardOutlined />,
    label: '支付配置',
    path: '/admin/payment',
    permission: 'billing:payment:config',
  },
  {
    icon: <MailOutlined />,
    label: '邮箱 SMTP',
    path: '/admin/email',
    permission: 'system:email:config',
  },
  {
    icon: <ThunderboltOutlined />,
    label: '短信 API',
    path: '/admin/sms',
    permission: 'system:sms:config',
  },
  {
    icon: <AuditOutlined />,
    label: '操作日志',
    path: '/admin/audit',
    permission: 'admin:audit:read',
  },
];

export const AdminLayout = ({ children }: PropsWithChildren) => {
  const { can, role } = useAdminAccess();
  const location = useLocation();
  const screens = Grid.useBreakpoint();
  const isDesktop = !!screens.lg;
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  const visibleDefinitions = useMemo(
    () => MENU_DEFINITIONS.filter(({ permission }) => can(permission)),
    [can],
  );
  const menuItems = useMemo<MenuProps['items']>(
    () =>
      visibleDefinitions.map(({ icon, label, path }) => ({
        icon,
        key: path,
        label: <Link to={path}>{label}</Link>,
      })),
    [visibleDefinitions],
  );
  const selectedKey =
    [...visibleDefinitions]
      .sort((first, second) => second.path.length - first.path.length)
      .find(({ path }) =>
        path === '/admin'
          ? location.pathname === path
          : location.pathname === path || location.pathname.startsWith(`${path}/`),
      )?.path ?? '/admin';

  const brand = (
    <Flexbox horizontal align={'center'} gap={12} padding={16}>
      <img alt={'CQ'} className={styles.brandLogo} src={'/brand/cq-logo-64.png'} />
      <Flexbox flex={1} gap={2} style={{ minWidth: 0 }}>
        <Text strong>Wedai Admin</Text>
        <Tag bordered={false} style={{ alignSelf: 'flex-start', margin: 0 }}>
          {role}
        </Tag>
      </Flexbox>
    </Flexbox>
  );
  const navigation = (
    <Menu className={styles.menu} items={menuItems} selectedKeys={[selectedKey]} />
  );

  return (
    <Layout className={styles.app} hasSider={isDesktop}>
      {isDesktop && (
        <Sider className={styles.sider} theme={'light'} width={ADMIN_SIDER_WIDTH}>
          {brand}
          {navigation}
        </Sider>
      )}
      <Layout>
        <Header className={styles.header}>
          <Flexbox horizontal align={'center'} gap={12} height={'100%'}>
            {!isDesktop && (
              <Button
                aria-label={'打开管理菜单'}
                icon={<MenuOutlined />}
                type={'text'}
                onClick={() => setDrawerOpen(true)}
              />
            )}
            <Text strong>{isDesktop ? '商业运营后台' : 'Wedai Admin'}</Text>
            <Flexbox flex={1} />
            <Tag bordered={false}>{role}</Tag>
          </Flexbox>
        </Header>
        <Content>
          <div className={styles.content} style={{ padding: isDesktop ? 24 : 12 }}>
            {children}
          </div>
        </Content>
      </Layout>
      {!isDesktop && (
        <Drawer
          bodyStyle={{ padding: 0 }}
          open={drawerOpen}
          placement={'left'}
          title={null}
          width={ADMIN_DRAWER_WIDTH}
          onClose={() => setDrawerOpen(false)}
        >
          <Flexbox className={styles.drawerBody} gap={8} height={'100%'}>
            {brand}
            {navigation}
          </Flexbox>
        </Drawer>
      )}
    </Layout>
  );
};
