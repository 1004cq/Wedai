'use client';

import { BRANDING_NAME } from '@lobechat/business-const';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PhoneAuthCard } from '@/features/Auth/Phone/PhoneAuthCard';
import { type AuthMethod, AuthMethodTabs } from '@/features/Auth/shared/AuthMethodTabs';

import DevSeedSignIn from './DevSeedSignIn';
import { SignInEmailSentStep } from './SignInEmailSentStep';
import { SignInEmailStep } from './SignInEmailStep';
import { SignInPasswordStep } from './SignInPasswordStep';
import { useSignIn } from './useSignIn';

const SignIn = () => {
  const { t } = useTranslation('auth');
  const [authMethod, setAuthMethod] = useState<AuthMethod>('email');
  const {
    agreementChecked,
    continueWithAgreement,
    disableEmailPassword,
    email,
    form,
    handleBackFromSent,
    handleBackToEmail,
    handleForgotPassword,
    handleGoToSignup,
    handleResendEmail,
    handleSocialSignIn,
    isSocialOnly,
    lastAuthProvider,
    loading,
    oAuthSSOProviders,
    sendError,
    sending,
    sessionExpired,
    sentInfo,
    serverConfigInit,
    setAgreementChecked,
    socialErrorProvider,
    socialLoading,
    step,
  } = useSignIn();

  if (step === 'emailSent' && sentInfo)
    return (
      <SignInEmailSentStep
        email={sentInfo.email}
        sendError={sendError}
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
        sendError={sendError}
        onBackToEmail={handleBackToEmail}
        onForgotPassword={handleForgotPassword}
      />
    );

  return (
    <>
      <AuthMethodTabs method={authMethod} onChange={setAuthMethod} />
      {authMethod === 'phone' ? (
        <PhoneAuthCard mode="signin" title={t('signin.subtitle', { appName: BRANDING_NAME })} />
      ) : (
        <SignInEmailStep
          agreementChecked={agreementChecked}
          continueWithAgreement={continueWithAgreement}
          disableEmailPassword={disableEmailPassword}
          form={form as any}
          isSocialOnly={isSocialOnly}
          lastAuthProvider={lastAuthProvider}
          loading={loading}
          oAuthSSOProviders={oAuthSSOProviders}
          sendError={sendError}
          serverConfigInit={serverConfigInit}
          sessionExpired={sessionExpired}
          setAgreementChecked={setAgreementChecked}
          socialErrorProvider={socialErrorProvider}
          socialLoading={socialLoading}
          onGoToSignup={handleGoToSignup}
          onResetEmail={handleBackToEmail}
          onSetPassword={handleForgotPassword}
          onSocialSignIn={handleSocialSignIn}
        />
      )}
      <DevSeedSignIn />
    </>
  );
};

export default SignIn;
