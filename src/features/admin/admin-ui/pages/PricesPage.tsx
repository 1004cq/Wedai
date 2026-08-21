'use client';

import { Button, Switch } from '@lobehub/ui/base-ui';
import type { TableColumnsType } from 'antd';
import { App, Empty, InputNumber, Table } from 'antd';
import { useCallback, useState } from 'react';

import { adminApi } from '../api';
import { AdminErrorState, AdminForbiddenBanner, AdminPage } from '../components/AdminPage';
import { AdminScrollSurface } from '../components/AdminScrollSurface';
import { useAdminAccess } from '../hooks/useAdminAccess';
import { useAdminQuery } from '../hooks/useAdminQuery';
import type { AdminModelPrice } from '../types';
import { formatDateTime } from '../utils';

export const PricesPage = () => {
  const { message } = App.useApp();
  const { can, state } = useAdminAccess();
  const [drafts, setDrafts] = useState<Record<string, AdminModelPrice>>({});
  const [savingId, setSavingId] = useState<string>();
  const loader = useCallback(() => adminApi.listPrices(), []);
  const { data, error, isLoading, reload } = useAdminQuery(loader);
  const canWrite = can('billing:price:write');

  if (state.status === 'forbidden') return <AdminForbiddenBanner />;

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
    const draft = getDraft(price);
    setSavingId(price.id);
    try {
      // Backend uses upsert: create a new row, archiving the previous active one.
      await adminApi.upsertPrice({
        modelId: draft.model,
        provider: draft.provider,
        promptCreditsPerKToken: draft.inputCredits,
        completionCreditsPerKToken: draft.outputCredits,
        isActive: draft.enabled,
      });
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

  const handleArchive = async (price: AdminModelPrice) => {
    if (!canWrite) return;
    try {
      await adminApi.archivePrice(price.id);
      message.success(`已归档 ${price.model}`);
      reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '归档失败');
    }
  };

  const creditInput = (
    price: AdminModelPrice,
    field: 'inputCredits' | 'outputCredits',
    _label: string,
  ) => (
    <InputNumber
      disabled={!canWrite}
      min={0}
      precision={0}
      style={{ width: 96 }}
      value={getDraft(price)[field]}
      onChange={(value) => patchDraft(price, { [field]: value ?? 0 })}
    />
  );

  const columns: TableColumnsType<AdminModelPrice> = [
    { dataIndex: 'provider', title: '服务商' },
    { dataIndex: 'model', title: '模型' },
    {
      render: (_, price) => creditInput(price, 'inputCredits', '输入'),
      title: '输入积分/千 token',
    },
    {
      render: (_, price) => creditInput(price, 'outputCredits', '输出'),
      title: '输出积分/千 token',
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
          <Button.Group>
            <Button
              disabled={!drafts[price.id]}
              loading={savingId === price.id}
              size={'small'}
              type={'primary'}
              onClick={() => handleSave(price)}
            >
              保存
            </Button>
            <Button danger size={'small'} type={'text'} onClick={() => handleArchive(price)}>
              归档
            </Button>
          </Button.Group>
        ) : null,
      title: '操作',
    },
  ];

  return (
    <AdminPage
      description={'所有价格使用整数积分；保存后的新请求使用新价格，历史价格快照不变。'}
      title={'模型价格'}
    >
      {error ? (
        <AdminErrorState error={error} onRetry={reload} />
      ) : (
        <AdminScrollSurface>
          <Table<AdminModelPrice>
            columns={columns}
            dataSource={data}
            loading={isLoading}
            locale={{ emptyText: <Empty description={'暂无模型价格'} /> }}
            pagination={false}
            rowKey={'id'}
            scroll={{ x: 900 }}
          />
        </AdminScrollSurface>
      )}
    </AdminPage>
  );
};
