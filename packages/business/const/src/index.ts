import { BRANDING_PROVIDER } from './branding';

export * from './branding';
export * from './llm';
export * from './url';

/**
 * Enable Wedai commercial billing features (Plans / Credits / Billing sidebar,
 * Admin RBAC, chargeBeforeChat, etc.).
 *
 * Set to `true` for the Wedai commercial build.
 * Upstream LobeHub forks should keep this `false`.
 */
export const ENABLE_BUSINESS_FEATURES = true;

/**
 * Master switch for the (now removed) conversational agent-onboarding flow.
 *
 * Soft-disabled: kept in the codebase but permanently off. No client code
 * reads this anymore now that the agent-onboarding flow has been deleted.
 */
export const AGENT_ONBOARDING_ENABLED = false;

export const OFFICIAL_PROVIDER_DISABLE_ERROR = 'The official provider cannot be disabled.';

export const isOfficialProvider = (id: string) =>
  ENABLE_BUSINESS_FEATURES && id === BRANDING_PROVIDER;
