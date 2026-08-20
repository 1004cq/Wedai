'use client';

import { Icon, Text } from '@lobehub/ui';
import { Button } from '@lobehub/ui/base-ui';
import { Form, Input } from 'antd';
import { createStaticStyles } from 'antd-style';
import { Phone } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import AuthCard from '@/features/AuthCard';
import { AuthAgreement } from '@/features/AuthShell';
import { CN_PHONE_REGEX, OTP_LENGTH } from '@/libs/better-auth/phone-auth';

import { usePhoneAuth } from './usePhoneAuth';

const styles = createStaticStyles(({ css, cssVar }) => ({
  inlineLink: css`
    cursor: pointer;
    color: ${cssVar.colorPrimary};
    text-decoration: underline;
  `,
  otpHint: css`
    margin-block-end: 8px;
    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
  `,
}));

export interface PhoneAuthCardProps {
  footer?: ReactNode;
  mode: 'signup' | 'signin';
  title: string;
}

export const PhoneAuthCard = ({ mode, title, footer }: PhoneAuthCardProps) => {
  const { t } = useTranslation('auth');
  const {
    agreementChecked,
    continueWithAgreement,
    countdown,
    form,
    handleBackToPhone,
    handleResendOtp,
    handleSendOtp,
    handleVerifyOtp,
    loading,
    otpInputRef,
    phoneInputRef,
    sending,
    setAgreementChecked,
    step,
  } = usePhoneAuth({ mode });

  if (step === 'otp') {
    return (
      <AuthCard footer={footer} title={title}>
        <Text className={styles.otpHint}>
          {t('betterAuth.phone.otpSentTo', {
            phone: form.getFieldValue('phone'),
          })}
        </Text>
        <Form form={form} layout="vertical" onFinish={(v) => void handleVerifyOtp(v as any)}>
          <Form.Item
            name="otp"
            rules={[
              { message: t('betterAuth.phone.errors.otpRequired'), required: true },
              {
                len: OTP_LENGTH,
                message: t('betterAuth.phone.errors.otpLength'),
              },
            ]}
          >
            <Input
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={OTP_LENGTH}
              placeholder={t('betterAuth.phone.otpPlaceholder')}
              ref={otpInputRef}
              size="large"
              style={{ letterSpacing: '0.25em', textAlign: 'center' }}
            />
          </Form.Item>
          <Button block htmlType="submit" loading={loading} size="large" type="primary">
            {t('betterAuth.phone.verifySubmit')}
          </Button>
        </Form>
        <Text
          align="center"
          fontSize={13}
          style={{ display: 'block', marginTop: 12 }}
          type="secondary"
        >
          {countdown > 0 ? (
            t('betterAuth.phone.resendCountdown', { seconds: countdown })
          ) : (
            <a
              className={styles.inlineLink}
              role="button"
              tabIndex={0}
              onClick={() => void handleResendOtp()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  void handleResendOtp();
                }
              }}
            >
              {t('betterAuth.phone.resend')}
            </a>
          )}{' '}
          ·{' '}
          <a
            className={styles.inlineLink}
            role="button"
            tabIndex={0}
            onClick={handleBackToPhone}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleBackToPhone();
              }
            }}
          >
            {t('betterAuth.phone.changePhone')}
          </a>
        </Text>
      </AuthCard>
    );
  }

  return (
    <AuthCard footer={footer} title={title}>
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) =>
          continueWithAgreement(() => {
            void handleSendOtp(values as { phone: string });
          })
        }
      >
        <Form.Item
          name="phone"
          rules={[
            { message: t('betterAuth.phone.errors.phoneRequired'), required: true },
            {
              validator: (_, value) => {
                if (!value) return Promise.resolve();
                const digits = String(value).trim().replaceAll(/\s|-/g, '');
                return CN_PHONE_REGEX.test(digits)
                  ? Promise.resolve()
                  : Promise.reject(new Error(t('betterAuth.phone.errors.invalidPhone')));
              },
            },
          ]}
        >
          <Input
            addonBefore="+86"
            autoComplete="tel"
            inputMode="numeric"
            maxLength={13}
            placeholder={t('betterAuth.phone.phonePlaceholder')}
            prefix={<Icon icon={Phone} style={{ marginInline: 6 }} />}
            ref={phoneInputRef}
            size="large"
          />
        </Form.Item>
        <AuthAgreement checked={agreementChecked} onChange={setAgreementChecked} />
        <Button block htmlType="submit" loading={sending} size="large" type="primary">
          {t('betterAuth.phone.sendOtp')}
        </Button>
      </Form>
    </AuthCard>
  );
};
