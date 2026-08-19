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
    margin-bottom: 16px;
  `,
  statusBadge: css`
    display: inline-block;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    text-transform: uppercase;
  `,
  title: css`
    font-size: 22px;
    font-weight: 600;
    margin-bottom: 16px;
  `,
  wrapper: css`
    max-width: 720px;
    padding: 24px 0;
  `,
}));

const statusColor: Record<string, string> = {
  paid:    'color-mix(in srgb, green 20%, transparent)',
  pending: 'color-mix(in srgb, orange 20%, transparent)',
  closed:  'color-mix(in srgb, gray 20%, transparent)',
  failed:  'color-mix(in srgb, red 15%, transparent)',
};

const Billing: FC = () => {
  const { styles } = useStyles();
  const { t } = useTranslation('billing');

  const { data: orders, isLoading } = useClientDataSWR(
    'topUp.list',
    async () => {
      // List last 10 orders via getOrder — we don't have a user-facing list yet,
      // so we show the spend usage history as a proxy for now.
      return null;
    },
  );

  const { data: usageData } = useClientDataSWR(
    'spend.usageHistory',
    () => lambdaClient.spend.usageHistory.query({ cursor: 0, limit: 10 }),
  );

  return (
    <div className={styles.wrapper}>
      <h2 className={styles.title}>{t('billing.title', 'Billing & Usage')}</h2>

      <div className={styles.card}>
        <p style={{ fontWeight: 600, marginBottom: 12 }}>
          {t('billing.recentUsage', 'Recent Model Usage')}
        </p>
        {isLoading && <p style={{ opacity: 0.5 }}>Loading…</p>}

        {usageData && usageData.items.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', opacity: 0.6 }}>
                <th style={{ paddingBottom: 8 }}>{t('billing.model', 'Model')}</th>
                <th style={{ paddingBottom: 8 }}>{t('billing.tokens', 'Tokens')}</th>
                <th style={{ paddingBottom: 8 }}>{t('billing.credits', 'Credits')}</th>
                <th style={{ paddingBottom: 8 }}>{t('billing.status', 'Status')}</th>
                <th style={{ paddingBottom: 8 }}>{t('billing.date', 'Date')}</th>
              </tr>
            </thead>
            <tbody>
              {usageData.items.map((rec) => (
                <tr key={rec.id} style={{ borderTop: '1px solid rgba(0,0,0,.06)' }}>
                  <td style={{ padding: '8px 0' }}>
                    {rec.modelId}
                    <span style={{ opacity: 0.5, fontSize: 11 }}> ({rec.provider})</span>
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
        ) : (
          !isLoading && (
            <p style={{ opacity: 0.5 }}>
              {t('billing.noUsage', 'No usage recorded yet. Start a conversation to see charges here.')}
            </p>
          )
        )}
      </div>

      <p style={{ fontSize: 12, opacity: 0.4 }}>
        {t('billing.auditNote', 'All amounts are authoritative server values. Contact support for disputes.')}
      </p>
    </div>
  );
};

export default Billing;
