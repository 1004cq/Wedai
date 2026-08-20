'use client';

import { toast } from '@lobehub/ui/base-ui';
import { Form, type InputRef } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { useAuthAgreement } from '@/features/AuthShell';
import { trackLoginOrSignupClicked } from '@/features/User/UserLoginOrSignup/trackLoginOrSignupClicked';
import { sendPhoneOtp, verifyPhoneOtp } from '@/libs/better-auth/auth-client';
import { toE164FromDomestic } from '@/libs/better-auth/phone-auth';
import { buildOnboardingRedirectUrl, sanitizeRedirectPath } from '@/utils/onboardingRedirect';

const RESEND_SECONDS = 60;

type PhoneStep = 'phone' | 'otp';

interface PhoneFormValues {
  otp: string;
  phone: string;
}

export interface UsePhoneAuthOptions {
  /** signup | signin — affects analytics spm only; flow is identical (verify creates account). */
  mode: 'signup' | 'signin';
}

export const usePhoneAuth = ({ mode }: UsePhoneAuthOptions) => {
  const { t } = useTranslation(['auth', 'authError']);
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm<PhoneFormValues>();
  const [step, setStep] = useState<PhoneStep>('phone');
  const [e164Phone, setE164Phone] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const phoneInputRef = useRef<InputRef>(null);
  const otpInputRef = useRef<InputRef>(null);
  const { agreementChecked, continueWithAgreement, setAgreementChecked } = useAuthAgreement();

  useEffect(() => {
    if (step === 'phone') phoneInputRef.current?.focus();
    else otpInputRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (countdown <= 0) return undefined;
    const timer = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  const mapPhoneError = useCallback(
    (error: { code?: string; message?: string; status?: number }) => {
      if (error.status === 429 || error.code === 'TOO_MANY_REQUESTS') {
        return t('betterAuth.phone.errors.rateLimited');
      }
      if (error.code === 'INVALID_OTP') {
        return t('betterAuth.phone.errors.invalidOtp');
      }
      if (error.code === 'OTP_EXPIRED') {
        return t('betterAuth.phone.errors.otpExpired');
      }
      if (error.code === 'TOO_MANY_ATTEMPTS') {
        return t('betterAuth.phone.errors.tooManyAttempts');
      }
      if (error.code === 'INVALID_PHONE_NUMBER') {
        return t('betterAuth.phone.errors.invalidPhone');
      }
      const translated = error.code ? t(`authError:codes.${error.code}`, { defaultValue: '' }) : '';
      return translated || error.message || t('betterAuth.phone.errors.sendFailed');
    },
    [t],
  );

  const dispatchOtp = useCallback(
    async (domesticPhone: string): Promise<boolean> => {
      const normalized = toE164FromDomestic(domesticPhone);
      if (!normalized) {
        toast.error(t('betterAuth.phone.errors.invalidPhone'));
        return false;
      }

      setSending(true);
      try {
        const { error } = await sendPhoneOtp(normalized);
        if (error) {
          toast.error(mapPhoneError(error));
          return false;
        }
        setE164Phone(normalized);
        setStep('otp');
        setCountdown(RESEND_SECONDS);
        form.setFieldValue('otp', '');
        return true;
      } catch {
        toast.error(t('betterAuth.phone.errors.sendFailed'));
        return false;
      } finally {
        setSending(false);
      }
    },
    [form, mapPhoneError, t],
  );

  const handleSendOtp = async (values: Pick<PhoneFormValues, 'phone'>) => {
    await trackLoginOrSignupClicked({
      spm: mode === 'signup' ? 'signup.phone.send_otp' : 'signin.phone.send_otp',
    });
    await dispatchOtp(values.phone);
  };

  const handleResendOtp = async () => {
    if (countdown > 0 || sending) return;
    const phone = form.getFieldValue('phone');
    if (!phone) return;
    const ok = await dispatchOtp(phone);
    if (ok) toast.success(t('betterAuth.phone.otpResent'));
  };

  const handleVerifyOtp = async (values: PhoneFormValues) => {
    if (!e164Phone) return;
    setLoading(true);
    await trackLoginOrSignupClicked({
      spm: mode === 'signup' ? 'signup.phone.verify_otp' : 'signin.phone.verify_otp',
    });

    try {
      const callbackUrl = searchParams.get('callbackUrl') || '/';
      const redirectUrl =
        mode === 'signup'
          ? buildOnboardingRedirectUrl(callbackUrl)
          : sanitizeRedirectPath(callbackUrl);

      const { error } = await verifyPhoneOtp(e164Phone, values.otp.trim());
      if (error) {
        form.setFields([
          {
            errors: [mapPhoneError(error)],
            name: 'otp',
          },
        ]);
        return;
      }

      window.location.href = redirectUrl;
    } catch {
      toast.error(t('betterAuth.phone.errors.verifyFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleBackToPhone = () => {
    setStep('phone');
    form.setFieldValue('otp', '');
  };

  return {
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
  };
};
