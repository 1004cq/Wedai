'use client';

import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import { useClientDataSWR } from '@/libs/swr';
import { lambdaClient } from '@/libs/trpc/client';

import { billingPageStyles as styles } from './billingPageStyles';

const Credits: FC = () => {
  const { t } = useTranslation('billing');

  const {
    data,
    error,
    isLoading,
    mutate: mutateBalance,
  } = useClientDataSWR('spend.balance', () => lambdaClient.spend.balance.query());

  const {
    data: history,
    error: historyError,
    isLoading: historyLoading,
    mutate: mutateHistory,
  } = useClientDataSWR('spend.ledgerHistory', () =>
    lambdaClient.spend.ledgerHistory.query({ cursor: 0, limit: 20 }),
  );

  const retryAll = () => {
    void mutateBalance();
    void mutateHistory();
  };

  return (
    <div className={styles.wrapper}>
      <h2 className={styles.title}>{t('credits.title')}</h2>

      <AsyncBoundary data={data} error={error} isLoading={isLoading} onRetry={retryAll}>
        <div className={styles.row}>
          <div className={styles.card} style={{ flex: '1 1 140px' }}>
            <p className={styles.label}>{t('credits.available')}</p>
            <p className={styles.value}>{data?.available ?? '0'}</p>
          </div>
          <div className={styles.card} style={{ flex: '1 1 140px' }}>
            <p className={styles.label}>{t('credits.reserved')}</p>
            <p className={styles.value}>{data?.reserved ?? '0'}</p>
          </div>
        </div>
      </AsyncBoundary>

      <AsyncBoundary
        data={history}
        empty={<p style={{ opacity: 0.5 }}>{t('credits.noActivity')}</p>}
        error={historyError}
        isEmpty={(history?.items.length ?? 0) === 0}
        isLoading={historyLoading}
        onRetry={() => mutateHistory()}
      >
        <div className={styles.card}>
          <p className={styles.label} style={{ marginBottom: 12 }}>
            {t('credits.recentActivity')}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('credits.kind')}</th>
                  <th>{t('credits.delta')}</th>
                  <th>{t('credits.balance')}</th>
                  <th>{t('credits.reason')}</th>
                  <th>{t('credits.date')}</th>
                </tr>
              </thead>
              <tbody>
                {(history?.items ?? []).map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.kind}</td>
                    <td
                      style={{
                        color: entry.delta.startsWith('-')
                          ? 'var(--lobe-color-error, #ff4d4f)'
                          : 'var(--lobe-color-success, #52c41a)',
                      }}
                    >
                      {entry.delta.startsWith('-') ? entry.delta : `+${entry.delta}`}
                    </td>
                    <td>{entry.balanceAfter}</td>
                    <td style={{ opacity: 0.7 }}>{entry.reason ?? '—'}</td>
                    <td style={{ opacity: 0.7 }}>
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </td>
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

export default Credits;
