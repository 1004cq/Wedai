'use client';

import { BRANDING_NAME } from '@lobechat/business-const';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PhoneAuthCard } from '@/features/Auth/Phone/PhoneAuthCard';
import { type AuthMethod, AuthMethodTabs } from '@/features/Auth/shared/AuthMethodTabs';

import { SignInEmailSentStep } from './SignInEmailSentStep';
import { SignInEmailStep } from './SignInEmailStep';
import { SignInPasswordStep } from './SignInPasswordStep';
import { useSignIn } from './useSignIn';

const SignIn = () => {
  const { t } = useTranslation('auth');
  const [authMethod, setAuthMethod] = useState<AuthMethod>('email');
  const {
    disableEmailPassword,
    email,
    form,
    handleBackFromSent,
    handleBackToEmail,
    handleCheckUser,
    handleForgotPassword,
    handleGoToSignup,
    handleResendEmail,
    handleSignIn,
    handleSocialSignIn,
    isSocialOnly,
    lastAuthProvider,
    loading,
    oAuthSSOProviders,
    sending,
    sentInfo,
    serverConfigInit,
    socialLoading,
    step,
  } = useSignIn();

  if (step === 'emailSent' && sentInfo)
    return (
      <SignInEmailSentStep
        email={sentInfo.email}
        sending={sending}
        type={sentInfo.type}
        onBack={handleBackFromSent}
        onResend={handleResendEmail}
      />
    );

  if (step === 'password')
    return (
      <SignInPasswordStep
        email={email}
        forgotLoading={sending}
        form={form as any}
        loading={loading}
        onBackToEmail={handleBackToEmail}
        onForgotPassword={handleForgotPassword}
        onSubmit={handleSignIn}
      />
    );

  return (
    <>
      <AuthMethodTabs method={authMethod} onChange={setAuthMethod} />
      {authMethod === 'phone' ? (
        <PhoneAuthCard mode="signin" title={t('signin.subtitle', { appName: BRANDING_NAME })} />
      ) : (
        <SignInEmailStep
          disableEmailPassword={disableEmailPassword}
          form={form as any}
          isSocialOnly={isSocialOnly}
          lastAuthProvider={lastAuthProvider}
          loading={loading}
          oAuthSSOProviders={oAuthSSOProviders}
          serverConfigInit={serverConfigInit}
          socialLoading={socialLoading}
          onCheckUser={handleCheckUser}
          onGoToSignup={handleGoToSignup}
          onResetEmail={handleBackToEmail}
          onSetPassword={handleForgotPassword}
          onSocialSignIn={handleSocialSignIn}
        />
      )}
    </>
  );
};

export default SignIn;
