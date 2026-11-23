// the code below can only be modified with commercial license
// if you want to use it in the commercial usage
// please contact us for more information: hello@lobehub.com

export const LOBE_CHAT_CLOUD = 'Wedai Cloud';

/** Typed as `string` so white-label forks can compare against upstream defaults. */
export const BRANDING_NAME: string = 'Wedai';
export const BRANDING_LOGO_URL = '/brand/cq-logo.png';

/**
 * Display name of the built-in default assistant (the inbox agent).
 *
 * Kept separate from `BRANDING_NAME` because it reads as a persona, not a
 * product: white-label deployments usually want something like
 * `'<Brand> AI'` rather than the bare product name. Drives
 * `DEFAULT_INBOX_TITLE` and the i18n brand post-processor, so overriding this
 * one constant renames the assistant everywhere.
 */
export const BRANDING_INBOX_TITLE: string = 'Wedai AI';

export const ORG_NAME = 'Wedai';

export const BRANDING_URL = {
  help: undefined,
  privacy: undefined,
  /**
   * Wedai: points to the local plans settings page.
   * PlanLimitCard renders this as the primary "Top up / Upgrade" button.
   * Using a relative path so it works on any deployment domain.
   */
  subscription: '/settings/plans',
  support: undefined,
  terms: undefined,
};

export const SOCIAL_URL = {
  discord: 'https://discord.gg/AYFPHvv2jT',
  github: 'https://github.com/lobehub',
  medium: 'https://medium.com/@lobehub',
  x: 'https://x.com/lobehub',
  youtube: 'https://www.youtube.com/@lobehub',
};

export const FILE_URL = {
  importFromNotionGuide: 'https://hub-apac-1.lobeobjects.space/assets/notion.mp4',
};

export const BRANDING_EMAIL = {
  business: 'hello@lobehub.com',
  replyTo: undefined,
  support: 'support@lobehub.com',
};

export const BRANDING_PROVIDER = 'lobehub';

export const APPLE_APP_STORE_ID = '';

export const COPYRIGHT = `© ${new Date().getFullYear()} ${ORG_NAME}`;
export const COPYRIGHT_FULL = `${COPYRIGHT}. All rights reserved.`;
