'use client';

import { createStaticStyles } from 'antd-style';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useClientDataSWR } from '@/libs/swr';
import { lambdaClient } from '@/libs/trpc/client';

const useStyles = createStaticStyles(({ css, token }) => ({
  card: css`
    background: ${token.colorBgContainer};
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    padding: 20px 24px;
  `,
  label: css`
    color: ${token.colorTextSecondary};
    font-size: 13px;
    margin-bottom: 4px;
  `,
  row: css`
    display: flex;
    gap: 16px;
    margin-bottom: 24px;
  `,
  stat: css`
    flex: 1;
  `,
  title: css`
    font-size: 22px;
    font-weight: 600;
    margin-bottom: 4px;
  `,
  value: css`
    font-size: 28px;
    font-weight: 700;
    color: ${token.colorText};
  `,
  wrapper: css`
    max-width: 720px;
    padding: 24px 0;
  `,
}));

const Credits: FC = () => {
  const { styles } = useStyles();
  const { t } = useTranslation('billing');

  const { data, isLoading } = useClientDataSWR(
    'spend.balance',
    () => lambdaClient.spend.balance.query(),
  );

  const { data: history } = useClientDataSWR(
    'spend.ledgerHistory',
    () => lambdaClient.spend.ledgerHistory.query({ cursor: 0, limit: 20 }),
  );

  return (
    <div className={styles.wrapper}>
      <h2 className={styles.title}>{t('credits.title', 'Credits & Balance')}</h2>

      <div className={styles.row}>
        <div className={styles.card} style={{ flex: 1 }}>
          <p className={styles.label}>{t('credits.available', 'Available Credits')}</p>
          <p className={styles.value}>{isLoading ? '…' : (data?.available ?? '0')}</p>
        </div>
        <div className={styles.card} style={{ flex: 1 }}>
          <p className={styles.label}>{t('credits.reserved', 'Reserved (In-flight)')}</p>
          <p className={styles.value}>{isLoading ? '…' : (data?.reserved ?? '0')}</p>
        </div>
      </div>

      {history && history.items.length > 0 && (
        <div className={styles.card}>
          <p className={styles.label} style={{ marginBottom: 12 }}>
            {t('credits.recentActivity', 'Recent Activity')}
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', opacity: 0.6 }}>
                <th style={{ paddingBottom: 8 }}>{t('credits.kind', 'Type')}</th>
                <th style={{ paddingBottom: 8 }}>{t('credits.delta', 'Amount')}</th>
                <th style={{ paddingBottom: 8 }}>{t('credits.balance', 'Balance After')}</th>
                <th style={{ paddingBottom: 8 }}>{t('credits.reason', 'Reason')}</th>
                <th style={{ paddingBottom: 8 }}>{t('credits.date', 'Date')}</th>
              </tr>
            </thead>
            <tbody>
              {history.items.map((entry) => (
                <tr key={entry.id} style={{ borderTop: '1px solid rgba(0,0,0,.06)' }}>
                  <td style={{ padding: '8px 0' }}>{entry.kind}</td>
                  <td style={{ color: entry.delta.startsWith('-') ? 'var(--color-error)' : 'var(--color-success)' }}>
                    {entry.delta.startsWith('-') ? entry.delta : `+${entry.delta}`}
                  </td>
                  <td>{entry.balanceAfter}</td>
                  <td style={{ opacity: 0.7 }}>{entry.reason ?? '—'}</td>
                  <td style={{ opacity: 0.7 }}>{new Date(entry.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {history?.items.length === 0 && !isLoading && (
        <p style={{ opacity: 0.5 }}>{t('credits.noActivity', 'No activity yet. Top up to get started.')}</p>
      )}
    </div>
  );
};

export default Credits;
