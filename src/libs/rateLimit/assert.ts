import { ChatErrorType } from '@lobechat/types';

import { createErrorResponse } from '@/utils/errorResponse';

import type { RateLimitNamespace } from './config';
import { checkFixedWindowRateLimit, type RateLimitDecision } from './index';

/**
 * Assert a user-scoped rate limit for webapi routes.
 * Returns a ready-to-send Response when blocked, otherwise the decision.
 */
export const assertUserRateLimitOrResponse = async (params: {
  namespace: RateLimitNamespace;
  identifier: string;
  provider?: string;
}): Promise<{ blocked: Response } | { blocked: null; decision: RateLimitDecision }> => {
  const decision = await checkFixedWindowRateLimit({
    namespace: params.namespace,
    identifier: params.identifier,
  });

  if (decision.allowed) {
    return { blocked: null, decision };
  }

  const response = createErrorResponse(ChatErrorType.TooManyRequests, {
    error: {
      message: 'Too many requests. Please try again later.',
      retryAfterSeconds: decision.retryAfterSeconds,
    },
    provider: params.provider,
  });

  if (decision.retryAfterSeconds > 0) {
    response.headers.set('Retry-After', String(decision.retryAfterSeconds));
  }

  return { blocked: response };
};
