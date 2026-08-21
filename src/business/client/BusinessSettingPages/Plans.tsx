'use client';

import { Button } from '@lobehub/ui/base-ui';
import { App } from 'antd';
import { cx } from 'antd-style';
import { type FC, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { mutate } from 'swr';

import AsyncBoundary from '@/components/AsyncBoundary';
import { useClientDataSWR } from '@/libs/swr';
import { lambdaClient } from '@/libs/trpc/client';

import { billingPageStyles as styles } from './billingPageStyles';

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 90_000;

type CheckoutState =
  | { kind: 'idle' }
  | { kind: 'processing'; orderId: string }
  | { kind: 'paid'; orderId: string }
  | { kind: 'timeout'; orderId: string }
  | { kind: 'cancelled'; orderId: string }
  | { kind: 'failed'; orderId: string };

const CheckoutBanner: FC<{ state: CheckoutState }> = ({ state }) => {
  const { t } = useTranslation('billing');

  if (state.kind === 'idle') return null;

  const content: Record<Exclude<CheckoutState['kind'], 'idle'>, { icon: string; text: string }> = {
    cancelled: { icon: '↩', text: t('checkout.cancelled') },
    failed: { icon: '⚠️', text: t('checkout.failed') },
    paid: { icon: '✅', text: t('checkout.paid') },
    processing: { icon: '⏳', text: t('checkout.processing') },
    timeout: { icon: '⏱', text: t('checkout.timeout') },
  };

  const item = content[state.kind];

  return (
    <div
      className={styles.card}
      style={{
        marginBottom: 16,
        opacity: state.kind === 'cancelled' ? 0.8 : 1,
      }}
    >
      <div style={{ alignItems: 'center', display: 'flex', gap: 12 }}>
        <span style={{ fontSize: 18 }}>{item.icon}</span>
        <span>{item.text}</span>
      </div>
    </div>
  );
};

const Plans: FC = () => {
  const { t } = useTranslation('billing');
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();

  const redirectOrderId = searchParams.get('orderId');
  const fromCheckout = searchParams.get('fromCheckout') === '1';
  const cancelled = searchParams.get('cancelled') === '1';

  const [checkoutState, setCheckoutState] = useState<CheckoutState>(() => {
    if (cancelled && redirectOrderId) return { kind: 'cancelled', orderId: redirectOrderId };
    if (fromCheckout && redirectOrderId) return { kind: 'processing', orderId: redirectOrderId };
    return { kind: 'idle' };
  });

  const [creatingPriceId, setCreatingPriceId] = useState<string>();
  const pollTimerRef = useRef<ReturnType<typeof setInterval>>();
  const pollStartRef = useRef<number>(0);

  const {
    data: plans,
    error: plansError,
    isLoading: plansLoading,
    mutate: mutatePlans,
  } = useClientDataSWR('subscription.listPlans', () => lambdaClient.subscription.listPlans.query());

  const { data: activeSub } = useClientDataSWR('subscription.getActive', () =>
    lambdaClient.subscription.getActive.query(),
  );

  const stopPolling = () => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = undefined;
  };

  useEffect(() => {
    if (checkoutState.kind !== 'processing') return;
    const { orderId } = checkoutState;
    pollStartRef.current = Date.now();

    pollTimerRef.current = setInterval(async () => {
      const elapsed = Date.now() - pollStartRef.current;

      try {
        const order = await lambdaClient.topUp.getOrder.query({ orderId });

        if (order.status === 'paid') {
          stopPolling();
          await mutate('spend.balance');
          await mutate('spend.ledgerHistory');
          setCheckoutState({ kind: 'paid', orderId });
          message.success(t('checkout.paid'), 4);
          setSearchParams({}, { replace: true });
          return;
        }

        if (order.status === 'closed' || order.status === 'failed') {
          stopPolling();
          setCheckoutState({ kind: 'failed', orderId });
          return;
        }

        if (elapsed >= POLL_TIMEOUT_MS) {
          stopPolling();
          setCheckoutState({ kind: 'timeout', orderId });
        }
      } catch {
        if (Date.now() - pollStartRef.current >= POLL_TIMEOUT_MS) {
          stopPolling();
          setCheckoutState({ kind: 'timeout', orderId });
        }
      }
    }, POLL_INTERVAL_MS);

    return stopPolling;
  }, [checkoutState.kind, message, setSearchParams, t]);

  const handleSubscribe = async (priceId: string) => {
    if (creatingPriceId) return;
    setCreatingPriceId(priceId);
    try {
      const res = await lambdaClient.topUp.createOrder.mutate({
        clientIdempotencyKey: `plans-${priceId}-${Date.now()}`,
        planPriceId: priceId,
      });
      window.location.href = res.checkoutUrl;
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('checkout.createFailed'));
      setCreatingPriceId(undefined);
    }
  };

  return (
    <div className={styles.wrapper}>
      <h2 className={styles.title}>{t('plans.title')}</h2>

      <CheckoutBanner state={checkoutState} />

      <AsyncBoundary
        data={plans}
        empty={<p style={{ opacity: 0.5 }}>{t('plans.noPlans')}</p>}
        error={plansError}
        isEmpty={(plans?.length ?? 0) === 0}
        isLoading={plansLoading}
        onRetry={() => mutatePlans()}
      >
        {activeSub && checkoutState.kind === 'idle' && (
          <p style={{ marginBottom: 8, opacity: 0.7 }}>
            {t('plans.currentPlan')}: <strong>{activeSub.plan?.name}</strong>
            {' — '}
            {t('plans.renewsOn')}{' '}
            {new Date(activeSub.subscription.currentPeriodEnd).toLocaleDateString()}
          </p>
        )}

        <div className={cx(styles.grid)}>
          {(plans ?? []).map((plan) => {
            const isCurrent = activeSub?.plan?.id === plan.id;
            const price = plan.prices[0];
            const isCreating = creatingPriceId === price?.id;
            const isOneTime = price?.billingInterval === 'one_time';
            const isFree = Number(price?.amountMinor ?? 0) === 0;
            const grant = Number(plan.tokenGrantMonthly ?? 0);

            return (
              <div className={styles.card} key={plan.id} style={{ flex: '1 1 220px' }}>
                <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
                  <strong style={{ fontSize: 16 }}>{plan.name}</strong>
                  {isCurrent && <span className={styles.currentBadge}>{t('plans.current')}</span>}
                </div>

                {price && (
                  <p className={styles.price}>
                    ¥
                    {(Number(price.amountMinor) / 100).toFixed(
                      Number(price.amountMinor) % 100 === 0 ? 0 : 1,
                    )}
                    <span style={{ fontSize: 13, fontWeight: 400, opacity: 0.6 }}>
                      {isOneTime
                        ? ` · ${t('plans.oneTime')}`
                        : isFree
                          ? ''
                          : ` / ${t('plans.perMonth')}`}
                    </span>
                  </p>
                )}

                {plan.description && (
                  <p style={{ fontSize: 13, opacity: 0.7 }}>{plan.description}</p>
                )}

                {grant > 0 && (
                  <p style={{ fontSize: 13 }}>
                    <span className={styles.badge}>
                      {grant.toLocaleString()}{' '}
                      {isOneTime ? t('plans.creditsOnce') : t('plans.creditsPerMonth')}
                    </span>
                  </p>
                )}

                <Button
                  disabled={isCurrent || !price || isFree || !!creatingPriceId}
                  loading={isCreating}
                  size="small"
                  type={isCurrent || isFree ? 'default' : 'primary'}
                  onClick={() => price && handleSubscribe(price.id)}
                >
                  {isCurrent
                    ? t('plans.current')
                    : isFree
                      ? t('plans.free')
                      : isOneTime
                        ? t('plans.buy')
                        : t('plans.subscribe')}
                </Button>
              </div>
            );
          })}
        </div>
      </AsyncBoundary>
    </div>
  );
};

export default Plans;
