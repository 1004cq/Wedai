import { CLIENT_VERSION_HEADER, CURRENT_VERSION } from '@lobechat/const';
import {
  adminClient,
  genericOAuthClient,
  inferAdditionalFields,
  magicLinkClient,
  phoneNumberClient,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import { type auth } from '@/auth';

export const authClient = createAuthClient({
  fetchOptions: {
    headers: {
      [CLIENT_VERSION_HEADER]: CURRENT_VERSION,
    },
  },
  plugins: [
    adminClient(),
    inferAdditionalFields<typeof auth>(),
    genericOAuthClient(),
    magicLinkClient(),
    phoneNumberClient(),
  ],
});

export const {
  changeEmail,
  linkSocial,
  oauth2,
  accountInfo,
  listAccounts,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
  signIn,
  signOut,
  signUp,
  unlinkAccount,
  useSession,
} = authClient;

/** Sends OTP via Aliyun PNVS (server SendSmsVerifyCode). */
export const sendPhoneOtp = (phoneNumber: string) =>
  authClient.phoneNumber.sendOtp({ phoneNumber });

/** Verifies OTP via CheckSmsVerifyCode and creates session. */
export const verifyPhoneOtp = (phoneNumber: string, code: string) =>
  authClient.phoneNumber.verify({ code, phoneNumber });
