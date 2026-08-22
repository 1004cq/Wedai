'use client';

import { BRANDING_NAME } from '@lobechat/business-const';
import { Text } from '@lobehub/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';

import { PhoneAuthCard } from '@/features/Auth/Phone/PhoneAuthCard';
import { type AuthMethod, AuthMethodTabs } from '@/features/Auth/shared/AuthMethodTabs';
import { useAuthServerConfigStore } from '@/features/AuthShell';
import { trackLoginOrSignupClicked } from '@/features/User/UserLoginOrSignup/trackLoginOrSignupClicked';

import BetterAuthSignUpForm from './BetterAuthSignUpForm';

const SignUp = () => {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [authMethod, setAuthMethod] = useState<AuthMethod>('email');
  const disableEmailPassword = useAuthServerConfigStore(
    (s) => s.serverConfig.disableEmailPassword || false,
  );

  if (disableEmailPassword) return <Navigate replace to="/signin" />;

  const phoneFooter = (
    <Text>
      {t('betterAuth.signup.hasAccount')}{' '}
      <Link
        to={`/signin?${searchParams.toString()}`}
        onClick={(event) => {
          event.preventDefault();
          void trackLoginOrSignupClicked({ spm: 'signup.phone.go_to_signin.click' }).finally(() => {
            navigate(`/signin?${searchParams.toString()}`);
          });
        }}
      >
        {t('betterAuth.signup.signinLink')}
      </Link>
    </Text>
  );

  return (
    <>
      <AuthMethodTabs method={authMethod} onChange={setAuthMethod} />
      {authMethod === 'phone' ? (
        <PhoneAuthCard
          footer={phoneFooter}
          mode="signup"
          title={t('betterAuth.signup.cardTitle', { appName: BRANDING_NAME })}
        />
      ) : (
        <BetterAuthSignUpForm />
      )}
    </>
  );
};

export default SignUp;
