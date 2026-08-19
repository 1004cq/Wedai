'use client';

import { Button } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useClientDataSWR } from '@/libs/swr';
import { lambdaClient } from '@/libs/trpc/client';

const useStyles = createStaticStyles(({ css, token }) => ({
  badge: css`
    background: ${token.colorPrimaryBg};
    border-radius: 4px;
    color: ${token.colorPrimary};
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
  `,
  card: css`
    background: ${token.colorBgContainer};
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    padding: 24px;
    flex: 1;
    min-width: 220px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  `,
  currentBadge: css`
    background: ${token.colorSuccessBg};
    border-radius: 4px;
    color: ${token.colorSuccess};
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
  `,
  grid: css`
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-top: 16px;
  `,
  price: css`
    font-size: 26px;
    font-weight: 700;
  `,
  title: css`
    font-size: 22px;
    font-weight: 600;
    margin-bottom: 4px;
  `,
  wrapper: css`
    max-width: 880px;
    padding: 24px 0;
  `,
}));

const Plans: FC = () => {
  const { styles } = useStyles();
  const { t } = useTranslation('billing');

  const { data: plans, isLoading: plansLoading } = useClientDataSWR(
    'subscription.listPlans',
    () => lambdaClient.subscription.listPlans.query(),
  );

  const { data: activeSub } = useClientDataSWR(
    'subscription.getActive',
    () => lambdaClient.subscription.getActive.query(),
  );

  if (plansLoading) return <p style={{ padding: 24, opacity: 0.5 }}>Loading plans…</p>;

  return (
    <div className={styles.wrapper}>
      <h2 className={styles.title}>{t('plans.title', 'Choose a Plan')}</h2>

      {activeSub && (
        <p style={{ opacity: 0.7, marginBottom: 8 }}>
          {t('plans.currentPlan', 'Current plan:')} <strong>{activeSub.plan?.name}</strong>
          {' — '}{t('plans.renewsOn', 'renews')} {new Date(activeSub.subscription.currentPeriodEnd).toLocaleDateString()}
        </p>
      )}

      <div className={styles.grid}>
        {(plans ?? []).map((plan) => {
          const isCurrent = activeSub?.plan?.id === plan.id;
          const price = plan.prices[0];

          return (
            <div key={plan.id} className={styles.card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontSize: 16 }}>{plan.name}</strong>
                {isCurrent && <span className={styles.currentBadge}>{t('plans.current', 'Current')}</span>}
              </div>

              {price && (
                <p className={styles.price}>
                  {price.currency}{' '}
                  {(Number(price.amountMinor) / 100).toFixed(2)}
                  <span style={{ fontSize: 13, fontWeight: 400, opacity: 0.6 }}>
                    {' / '}{price.billingInterval}
                  </span>
                </p>
              )}

              {plan.description && (
                <p style={{ fontSize: 13, opacity: 0.7 }}>{plan.description}</p>
              )}

              {plan.tokenGrantMonthly && Number(plan.tokenGrantMonthly) > 0 && (
                <p style={{ fontSize: 13 }}>
                  <span className={styles.badge}>
                    {(Number(plan.tokenGrantMonthly) / 1_000_000).toFixed(1)}M {t('plans.tokensPerMonth', 'tokens / mo')}
                  </span>
                </p>
              )}

              <Button
                disabled={isCurrent || !price}
                size="small"
                type={isCurrent ? 'default' : 'primary'}
                onClick={() => {
                  if (price) {
                    lambdaClient.topUp.createOrder
                      .mutate({ planPriceId: price.id })
                      .then((res) => { window.location.href = res.checkoutUrl; })
                      .catch(console.error);
                  }
                }}
              >
                {isCurrent ? t('plans.currentPlan', 'Current') : t('plans.subscribe', 'Subscribe')}
              </Button>
            </div>
          );
        })}

        {(plans ?? []).length === 0 && (
          <p style={{ opacity: 0.5 }}>{t('plans.noPlans', 'No plans available yet.')}</p>
        )}
      </div>
    </div>
  );
};

export default Plans;
