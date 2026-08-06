'use client';

import { Flexbox, Text } from '@lobehub/ui';
import { Button } from '@lobehub/ui/base-ui';
import { Alert, Skeleton } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import type { PropsWithChildren, ReactNode } from 'react';

const styles = createStaticStyles(({ css }) => ({
  configSurface: css`
    width: 100%;
    max-width: 720px;
    padding: 24px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorBgContainer};

    @media (width <= 575px) {
      padding: 16px;
    }
  `,
  pageTitle: css`
    margin: 0;
    font-size: ${cssVar.fontSizeHeading3};
    line-height: ${cssVar.lineHeightHeading3};
  `,
}));

interface AdminPageProps extends PropsWithChildren {
  actions?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
}

export const AdminPage = ({ actions, children, description, title }: AdminPageProps) => (
  <Flexbox gap={24} width={'100%'}>
    <Flexbox horizontal align={'flex-start'} gap={16} justify={'space-between'}>
      <Flexbox gap={4} style={{ minWidth: 0 }}>
        <Text as={'h1'} className={styles.pageTitle}>
          {title}
        </Text>
        {description && <Text type={'secondary'}>{description}</Text>}
      </Flexbox>
      {actions}
    </Flexbox>
    {children}
  </Flexbox>
);

export const AdminConfigSurface = ({ children }: PropsWithChildren) => (
  <div className={styles.configSurface}>{children}</div>
);

export const AdminLoading = () => <Skeleton active paragraph={{ rows: 6 }} />;

export const AdminErrorState = ({ error, onRetry }: { error: Error; onRetry: () => void }) => (
  <Alert
    showIcon
    action={<Button onClick={onRetry}>重新加载</Button>}
    description={error.message}
    message={'数据加载失败'}
    type={'error'}
  />
);
