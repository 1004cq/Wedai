'use client';

import { Button, Select, Switch } from '@lobehub/ui/base-ui';
import type { TableColumnsType } from 'antd';
import { App, Empty, InputNumber, Table } from 'antd';
import { useCallback, useState } from 'react';

import { AdminErrorState, AdminPage } from '../components/AdminPage';
import { useAdminAccess } from '../hooks/useAdminAccess';
import { useAdminQuery } from '../hooks/useAdminQuery';
import { adminMockApi } from '../mock/store';
import type { AdminModelPrice } from '../types';
import { formatDateTime } from '../utils';

export const PricesPage = () => {
  const { message } = App.useApp();
  const { can } = useAdminAccess();
  const [drafts, setDrafts] = useState<Record<string, AdminModelPrice>>({});
  const [savingId, setSavingId] = useState<string>();
  const loader = useCallback(() => adminMockApi.listPrices(), []);
  const { data, error, isLoading, reload } = useAdminQuery(loader);
  const canWrite = can('billing:price:write');

  const getDraft = (price: AdminModelPrice) => drafts[price.id] ?? price;
  const patchDraft = (price: AdminModelPrice, patch: Partial<AdminModelPrice>) =>
    setDrafts((current) => ({
      ...current,
      [price.id]: { ...getDraft(price), ...patch },
    }));

  const handleSave = async (price: AdminModelPrice) => {
    if (!canWrite) {
      message.error('当前账号没有价格写入权限');
      return;
    }
    setSavingId(price.id);
    try {
      await adminMockApi.updatePrice(getDraft(price));
      message.success(`已更新 ${price.model} 的价格`);
      setDrafts((current) => {
        const next = { ...current };
        delete next[price.id];
        return next;
      });
      reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '价格保存失败');
    } finally {
      setSavingId(undefined);
    }
  };

  const creditInput = (
    price: AdminModelPrice,
    field: 'inputCredits' | 'outputCredits' | 'requestCredits',
    disabled: boolean,
  ) => (
    <InputNumber
      disabled={!canWrite || disabled}
      min={0}
      precision={0}
      style={{ width: 112 }}
      value={getDraft(price)[field]}
      onChange={(value) => patchDraft(price, { [field]: value ?? 0 })}
    />
  );

  const columns: TableColumnsType<AdminModelPrice> = [
    { dataIndex: 'provider', title: '服务商' },
    { dataIndex: 'model', title: '模型' },
    {
      render: (_, price) => (
        <Select
          disabled={!canWrite}
          style={{ width: 120 }}
          value={getDraft(price).mode}
          options={[
            { label: 'Token', value: 'token' },
            { label: '按次', value: 'per_request' },
          ]}
          onChange={(mode) => patchDraft(price, { mode: mode as AdminModelPrice['mode'] })}
        />
      ),
      title: '计费模式',
    },
    {
      render: (_, price) => creditInput(price, 'inputCredits', getDraft(price).mode !== 'token'),
      title: '输入积分',
    },
    {
      render: (_, price) => creditInput(price, 'outputCredits', getDraft(price).mode !== 'token'),
      title: '输出积分',
    },
    {
      render: (_, price) =>
        creditInput(price, 'requestCredits', getDraft(price).mode !== 'per_request'),
      title: '每次积分',
    },
    {
      render: (_, price) => (
        <Switch
          checked={getDraft(price).enabled}
          disabled={!canWrite}
          onChange={(enabled) => patchDraft(price, { enabled })}
        />
      ),
      title: '启用',
    },
    { dataIndex: 'updatedAt', render: formatDateTime, title: '更新时间' },
    {
      fixed: 'right',
      render: (_, price) =>
        canWrite ? (
          <Button
            disabled={!drafts[price.id]}
            loading={savingId === price.id}
            size={'small'}
            type={'primary'}
            onClick={() => handleSave(price)}
          >
            保存
          </Button>
        ) : null,
      title: '操作',
    },
  ];

  return (
    <AdminPage
      description={'所有价格使用整数积分；价格变更只应影响保存后的新请求。'}
      title={'模型价格'}
    >
      {error ? (
        <AdminErrorState error={error} onRetry={reload} />
      ) : (
        <Table<AdminModelPrice>
          columns={columns}
          dataSource={data}
          loading={isLoading}
          locale={{ emptyText: <Empty description={'暂无模型价格'} /> }}
          pagination={false}
          rowKey={'id'}
          scroll={{ x: 'max-content' }}
        />
      )}
    </AdminPage>
  );
};
