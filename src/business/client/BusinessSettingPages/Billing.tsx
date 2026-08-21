'use client';

import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import { useClientDataSWR } from '@/libs/swr';
import { lambdaClient } from '@/libs/trpc/client';

import { billingPageStyles as styles } from './billingPageStyles';

const statusColor: Record<string, string> = {
  closed: 'color-mix(in srgb, gray 20%, transparent)',
  failed: 'color-mix(in srgb, red 15%, transparent)',
  paid: 'color-mix(in srgb, green 20%, transparent)',
  pending: 'color-mix(in srgb, orange 20%, transparent)',
};

const Billing: FC = () => {
  const { t } = useTranslation('billing');

  const {
    data: usageData,
    error,
    isLoading,
    mutate,
  } = useClientDataSWR('spend.usageHistory', () =>
    lambdaClient.spend.usageHistory.query({ cursor: 0, limit: 20 }),
  );

  return (
    <div className={styles.wrapper}>
      <h2 className={styles.title}>{t('billing.title')}</h2>

      <AsyncBoundary
        data={usageData}
        empty={<p style={{ opacity: 0.5 }}>{t('billing.noUsage')}</p>}
        error={error}
        isEmpty={(usageData?.items.length ?? 0) === 0}
        isLoading={isLoading}
        onRetry={() => mutate()}
      >
        <div className={styles.card}>
          <p style={{ fontWeight: 600, marginBottom: 12 }}>{t('billing.recentUsage')}</p>
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('billing.model')}</th>
                  <th>{t('billing.tokens')}</th>
                  <th>{t('billing.credits')}</th>
                  <th>{t('billing.status')}</th>
                  <th>{t('billing.date')}</th>
                </tr>
              </thead>
              <tbody>
                {(usageData?.items ?? []).map((rec) => (
                  <tr key={rec.id}>
                    <td>
                      {rec.modelId}
                      <span style={{ fontSize: 11, opacity: 0.5 }}> ({rec.provider})</span>
                    </td>
                    <td>{rec.totalTokens.toLocaleString()}</td>
                    <td>{rec.creditsCharged}</td>
                    <td>
                      <span
                        className={styles.statusBadge}
                        style={{ background: statusColor[rec.settlementStatus] ?? 'transparent' }}
                      >
                        {rec.settlementStatus}
                      </span>
                    </td>
                    <td style={{ opacity: 0.7 }}>{new Date(rec.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </AsyncBoundary>

      <p style={{ fontSize: 12, marginTop: 16, opacity: 0.4 }}>{t('billing.auditNote')}</p>
    </div>
  );
};

export default Billing;
