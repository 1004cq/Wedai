import { APPLE_APP_STORE_ID, BRANDING_NAME } from '@lobechat/business-const';
import { OG_URL } from '@lobechat/const';

import { DEFAULT_LANG } from '@/const/locale';
import { OFFICIAL_URL } from '@/const/url';
import { isCustomBranding, isCustomORG } from '@/const/version';
import { translation } from '@/libs/i18n/serverTranslation';
import { type DynamicLayoutProps } from '@/types/next';
import { RouteVariants } from '@/utils/server/routeVariants';

const isDev = process.env.NODE_ENV === 'development';

export const generateMetadata = async (props: DynamicLayoutProps) => {
  const locale = await RouteVariants.getLocale(props);
  const { t } = await translation('metadata', locale);
  const socialImage = isCustomBranding ? '/brand/cq-og.png' : OG_URL;

  return {
    alternates: {
      canonical: OFFICIAL_URL,
    },
    appleWebApp: {
      statusBarStyle: 'black-translucent',
      title: BRANDING_NAME,
    },
    description: t('chat.description', { appName: BRANDING_NAME }),
    icons: {
      apple: '/apple-touch-icon.png?v=2',
      icon: isDev ? '/favicon-dev.ico' : '/favicon.ico?v=2',
      shortcut: isDev ? '/favicon-32x32-dev.ico' : '/favicon-32x32.ico?v=2',
    },
    ...(APPLE_APP_STORE_ID ? { itunes: { appId: APPLE_APP_STORE_ID } } : {}),
    manifest: '/manifest.json',
    metadataBase: new URL(OFFICIAL_URL),
    openGraph: {
      description: t('chat.description', { appName: BRANDING_NAME }),
      images: [
        {
          alt: t('chat.title', { appName: BRANDING_NAME }),
          height: 630,
          url: socialImage,
          width: 1200,
        },
      ],
      locale: DEFAULT_LANG,
      siteName: BRANDING_NAME,
      title: BRANDING_NAME,
      type: 'website',
      url: OFFICIAL_URL,
    },
    title: {
      default: t('chat.title', { appName: BRANDING_NAME }),
      template: `%s · ${BRANDING_NAME}`,
    },
    twitter: {
      card: 'summary_large_image',
      description: t('chat.description', { appName: BRANDING_NAME }),
      images: [socialImage],
      site: isCustomORG ? undefined : '@lobehub',
      title: t('chat.title', { appName: BRANDING_NAME }),
    },
  };
};
