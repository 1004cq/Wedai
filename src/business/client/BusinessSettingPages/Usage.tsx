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

/**
 * Personal usage page — model consumption records via spend.usageHistory.
 * Must never return null (was previously an empty shell).
 */
const Usage: FC = () => {
  const { t } = useTranslation('billing');

  const { data, error, isLoading, mutate } = useClientDataSWR('spend.usageHistory.page', () =>
    lambdaClient.spend.usageHistory.query({ cursor: 0, limit: 30 }),
  );

  const totalCredits =
    data?.items.reduce((sum, item) => sum + Number(item.creditsCharged || 0), 0) ?? 0;
  const totalTokens = data?.items.reduce((sum, item) => sum + (item.totalTokens || 0), 0) ?? 0;

  return (
    <div className={styles.wrapper}>
      <h2 className={styles.title}>{t('usage.title')}</h2>
      <p style={{ marginBottom: 16, opacity: 0.7 }}>{t('usage.desc')}</p>

      <AsyncBoundary
        data={data}
        empty={<p style={{ opacity: 0.5 }}>{t('usage.empty')}</p>}
        error={error}
        isEmpty={(data?.items.length ?? 0) === 0}
        isLoading={isLoading}
        onRetry={() => mutate()}
      >
        <div className={styles.row}>
          <div className={styles.card} style={{ flex: '1 1 140px' }}>
            <p className={styles.label}>{t('usage.summaryTokens')}</p>
            <p className={styles.value}>{totalTokens.toLocaleString()}</p>
          </div>
          <div className={styles.card} style={{ flex: '1 1 140px' }}>
            <p className={styles.label}>{t('usage.summaryCredits')}</p>
            <p className={styles.value}>{totalCredits.toLocaleString()}</p>
          </div>
        </div>

        <div className={styles.card}>
          <p style={{ fontWeight: 600, marginBottom: 12 }}>{t('usage.recent')}</p>
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
                {(data?.items ?? []).map((rec) => (
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
    </div>
  );
};

export default Usage;
