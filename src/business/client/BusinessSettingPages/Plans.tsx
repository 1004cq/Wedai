'use client';

import { Button } from '@lobehub/ui/base-ui';
import { App } from 'antd';
import { createStaticStyles } from 'antd-style';
import { useEffect, useRef, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { mutate } from 'swr';

import { useClientDataSWR } from '@/libs/swr';
import { lambdaClient } from '@/libs/trpc/client';

// ─── Polling config ───────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 90_000; // 90 seconds — Stripe webhooks typically arrive in < 10s

// ─── Styles ───────────────────────────────────────────────────────────────────

const useStyles = createStaticStyles(({ css, token }) => ({
  badge: css`
    background: ${token.colorPrimaryBg};
    border-radius: 4px;
    color: ${token.colorPrimary};
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
  `,
  banner: css`
    border-radius: ${token.borderRadiusLG}px;
    border: 1px solid ${token.colorBorderSecondary};
    padding: 16px 20px;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
  `,
  bannerProcessing: css`
    background: ${token.colorInfoBg};
    border-color: ${token.colorInfoBorder};
    color: ${token.colorInfoText};
  `,
  bannerSuccess: css`
    background: ${token.colorSuccessBg};
    border-color: ${token.colorSuccessBorder};
    color: ${token.colorSuccessText};
  `,
  bannerTimeout: css`
    background: ${token.colorWarningBg};
    border-color: ${token.colorWarningBorder};
    color: ${token.colorWarningText};
  `,
  bannerCancelled: css`
    background: ${token.colorBgContainer};
    color: ${token.colorTextSecondary};
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

// ─── Checkout status banner ───────────────────────────────────────────────────

type CheckoutState =
  | { kind: 'idle' }
  | { kind: 'processing'; orderId: string }
  | { kind: 'paid'; orderId: string }
  | { kind: 'timeout'; orderId: string }
  | { kind: 'cancelled'; orderId: string }
  | { kind: 'failed'; orderId: string };

const CheckoutBanner: FC<{ state: CheckoutState }> = ({ state }) => {
  const { styles, cx } = useStyles();
  const { t } = useTranslation('billing');

  if (state.kind === 'idle') return null;

  const bannerClass = cx(
    styles.banner,
    state.kind === 'processing' && styles.bannerProcessing,
    state.kind === 'paid' && styles.bannerSuccess,
    (state.kind === 'timeout' || state.kind === 'failed') && styles.bannerTimeout,
    state.kind === 'cancelled' && styles.bannerCancelled,
  );

  const content: Record<Exclude<CheckoutState['kind'], 'idle'>, { icon: string; text: string }> = {
    cancelled: { icon: '↩', text: t('checkout.cancelled', '支付已取消，可重新选择套餐。') },
    failed: { icon: '⚠️', text: t('checkout.failed', '订单失败，请联系客服或重新下单。') },
    paid: { icon: '✅', text: t('checkout.paid', '积分已到账！余额已更新。') },
    processing: { icon: '⏳', text: t('checkout.processing', '支付处理中，正在等待确认…') },
    timeout: {
      icon: '⏱',
      text: t(
        'checkout.timeout',
        '暂未收到确认，可能仍在处理中。积分到账后余额会自动更新，无需重复支付。',
      ),
    },
  };

  const item = content[state.kind as Exclude<CheckoutState['kind'], 'idle'>];
  return (
    <div className={bannerClass}>
      <span style={{ fontSize: 18 }}>{item.icon}</span>
      <span>{item.text}</span>
    </div>
  );
};

// ─── Plans page ───────────────────────────────────────────────────────────────

const Plans: FC = () => {
  const { styles } = useStyles();
  const { t } = useTranslation('billing');
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();

  // Query params set by Stripe redirect
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

  // SWR data queries
  const { data: plans, isLoading: plansLoading } = useClientDataSWR(
    'subscription.listPlans',
    () => lambdaClient.subscription.listPlans.query(),
  );

  const { data: activeSub } = useClientDataSWR(
    'subscription.getActive',
    () => lambdaClient.subscription.getActive.query(),
  );

  // ── Polling logic ──────────────────────────────────────────────────────────

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
          // Refresh the balance display (Credits page / any consumer of spend.balance)
          await mutate('spend.balance');
          await mutate('spend.ledgerHistory');
          setCheckoutState({ kind: 'paid', orderId });
          message.success(t('checkout.paid', '积分已到账！'), 4);
          // Clear URL params to avoid re-triggering on refresh
          setSearchParams({}, { replace: true });
          return;
        }

        if (order.status === 'closed' || order.status === 'failed') {
          stopPolling();
          setCheckoutState({ kind: 'failed', orderId });
          return;
        }

        // Still pending — check timeout
        if (elapsed >= POLL_TIMEOUT_MS) {
          stopPolling();
          setCheckoutState({ kind: 'timeout', orderId });
        }
      } catch {
        // Network or auth error — keep polling until timeout
        if (Date.now() - pollStartRef.current >= POLL_TIMEOUT_MS) {
          stopPolling();
          setCheckoutState({ kind: 'timeout', orderId });
        }
      }
    }, POLL_INTERVAL_MS);

    return stopPolling;
  }, [checkoutState.kind]); // Only restart when kind changes

  // ── Subscribe handler ──────────────────────────────────────────────────────

  const handleSubscribe = async (priceId: string) => {
    if (creatingPriceId) return; // prevent double-click
    setCreatingPriceId(priceId);
    try {
      const res = await lambdaClient.topUp.createOrder.mutate({
        planPriceId: priceId,
        // Stable idempotency key: same browser session + priceId won't create a second order
        clientIdempotencyKey: `plans-${priceId}-${Date.now()}`,
      });
      // Navigate to Stripe Checkout (full page navigation)
      window.location.href = res.checkoutUrl;
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('checkout.createFailed', '创建订单失败'));
      setCreatingPriceId(undefined);
    }
    // Don't clear creatingPriceId on success — page navigates away
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (plansLoading) return <p style={{ opacity: 0.5, padding: 24 }}>Loading plans…</p>;

  return (
    <App>
      <div className={styles.wrapper}>
        <h2 className={styles.title}>{t('plans.title', 'Choose a Plan')}</h2>

        <CheckoutBanner state={checkoutState} />

        {activeSub && checkoutState.kind === 'idle' && (
          <p style={{ marginBottom: 8, opacity: 0.7 }}>
            {t('plans.currentPlan', 'Current plan:')} <strong>{activeSub.plan?.name}</strong>
            {' — '}
            {t('plans.renewsOn', 'renews')}{' '}
            {new Date(activeSub.subscription.currentPeriodEnd).toLocaleDateString()}
          </p>
        )}

        <div className={styles.grid}>
          {(plans ?? []).map((plan) => {
            const isCurrent = activeSub?.plan?.id === plan.id;
            const price = plan.prices[0];
            const isCreating = creatingPriceId === price?.id;

            return (
              <div key={plan.id} className={styles.card}>
                <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
                  <strong style={{ fontSize: 16 }}>{plan.name}</strong>
                  {isCurrent && (
                    <span className={styles.currentBadge}>
                      {t('plans.current', 'Current')}
                    </span>
                  )}
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
                      {(Number(plan.tokenGrantMonthly) / 1_000_000).toFixed(1)}M{' '}
                      {t('plans.tokensPerMonth', 'tokens / mo')}
                    </span>
                  </p>
                )}

                <Button
                  disabled={isCurrent || !price || !!creatingPriceId}
                  loading={isCreating}
                  size="small"
                  type={isCurrent ? 'default' : 'primary'}
                  onClick={() => price && handleSubscribe(price.id)}
                >
                  {isCurrent
                    ? t('plans.currentPlan', 'Current')
                    : t('plans.subscribe', 'Subscribe')}
                </Button>
              </div>
            );
          })}

          {(plans ?? []).length === 0 && (
            <p style={{ opacity: 0.5 }}>{t('plans.noPlans', 'No plans available yet.')}</p>
          )}
        </div>
      </div>
    </App>
  );
};

export default Plans;
