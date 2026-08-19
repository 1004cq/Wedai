import { AGENT_RUNTIME_ERROR_SET, type ChatCompletionErrorPayload } from '@lobechat/model-runtime';
import { ChatErrorType, type ModelTokensUsage } from '@lobechat/types';
import { eq } from 'drizzle-orm';

import { checkAuth } from '@/app/(backend)/middleware/auth';
import {
  chargeAfterChat,
  chargeBeforeChat,
  InsufficientBalanceError,
} from '@/business/server/chat-billing';
import { users } from '@/database/schemas';
import { checkFixedWindowRateLimit } from '@/libs/rateLimit';
import { createTraceOptions, initModelRuntimeFromDB } from '@/server/modules/ModelRuntime';
import { type ChatStreamPayload } from '@/types/openai/chat';
import { createErrorResponse } from '@/utils/errorResponse';
import { getTracePayload } from '@/utils/trace';

import { resolveValidWorkspaceIdFromRequest } from '../../_utils/workspace';

export const maxDuration = 300;

const CHAT_RL_WINDOW_SECONDS = Number.parseInt(
  process.env.RATE_LIMIT_CHAT_WINDOW_SECONDS ?? '60',
  10,
);
const CHAT_RL_PER_MINUTE = Number.parseInt(process.env.RATE_LIMIT_CHAT_PER_MINUTE ?? '30', 10);

export const POST = checkAuth(async (req: Request, { params, userId, serverDB }) => {
  const provider = (await params)!.provider!;
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();

  try {
    const workspaceId = await resolveValidWorkspaceIdFromRequest({ req, serverDB, userId });

    // ============  B3: rate limit chat  ============ //
    const decision = await checkFixedWindowRateLimit({
      namespace: 'chat',
      identifier: userId,
      limit: CHAT_RL_PER_MINUTE,
      windowSeconds: CHAT_RL_WINDOW_SECONDS,
    });

    if (!decision.allowed) {
      return createErrorResponse(ChatErrorType.TooManyRequests, {
        error: { message: 'Too many requests', retryAfterSeconds: decision.retryAfterSeconds },
        provider,
      });
    }

    // ============  0. banned check  ============ //
    const [userRow] = await serverDB
      .select({ banned: users.banned })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (userRow?.banned) {
      return createErrorResponse(ChatErrorType.Forbidden, {
        error: { message: 'Account suspended' },
        provider,
      });
    }

    // ============  1. init chat model  ============ //
    const modelRuntime = await initModelRuntimeFromDB(serverDB, userId, provider, workspaceId);

    // ============  2. parse payload  ============ //
    const data = (await req.json()) as ChatStreamPayload;
    const modelId = data.model ?? '';

    // ============  3. billing: pre-flight hold  ============ //
    // Determines BYOK vs platform; if platform, atomically reserves credits.
    // Throws InsufficientBalanceError if balance < estimate.
    const billingContext = await chargeBeforeChat({
      db: serverDB,
      estimatedPromptTokens: estimatePromptTokens(data),
      maxCompletionTokens: data.max_tokens ?? 4096,
      modelId,
      provider,
      requestId,
      userId,
      userHasProviderKey: modelRuntime.baseURL !== undefined,
    });

    // ============  4. create chat completion  ============ //
    const tracePayload = getTracePayload(req);
    let traceOptions = {};
    if (tracePayload?.enabled) {
      traceOptions = createTraceOptions(data, { provider, trace: tracePayload });
    }

    // Capture actual token usage from the stream via onUsage callback.
    // This gives us real numbers for settlement rather than the pre-flight estimate.
    let capturedUsage: ModelTokensUsage | undefined;

    let response: Response;
    try {
      response = await modelRuntime.chat(data, {
        ...traceOptions,
        callback: {
          onUsage: (usage) => {
            capturedUsage = usage;
          },
        },
        signal: req.signal,
        user: userId,
      });
    } catch (providerError) {
      // ============  5a. provider error / client abort: release hold  ============ //
      await chargeAfterChat({
        billingContext,
        db: serverDB,
        modelId,
        provider,
        success: false,
        userId,
      });
      throw providerError;
    }

    // ============  5b. success: settle credits  ============ //
    // For streaming responses, onUsage fires when the stream closes.
    // If onUsage didn't fire (provider doesn't report usage), fall back to
    // the x-usage header, then to the pre-flight estimate.
    const usageHeader = response.headers.get('x-usage-total-tokens');
    const rawUsage = capturedUsage
      ? {
          completionTokens: capturedUsage.outputTextTokens,
          promptTokens: capturedUsage.inputTextTokens,
          totalTokens: capturedUsage.totalTokens,
        }
      : usageHeader
        ? { totalTokens: Number.parseInt(usageHeader, 10) }
        : { totalTokens: estimatePromptTokens(data) + (data.max_tokens ?? 4096) };

    // Fire-and-forget: don't block the streaming response.
    // The stale-hold reaper handles the rare crash-between-response-and-settle case.
    void chargeAfterChat({
      billingContext,
      db: serverDB,
      modelId,
      provider,
      rawUsage,
      success: true,
      userId,
    });

    return response;
  } catch (e) {
    if (e instanceof InsufficientBalanceError) {
      // Use InsufficientBudgetForModel — the existing error type the frontend
      // PlanLimitCard component recognises.
      return createErrorResponse(ChatErrorType.InsufficientBudgetForModel, {
        budget: { pricingBasis: 'estimated' },
        error: { message: e.message },
        provider,
      });
    }

    const {
      errorType = ChatErrorType.InternalServerError,
      error: errorContent,
      ...res
    } = e as ChatCompletionErrorPayload;

    const error = errorContent || e;

    if (AGENT_RUNTIME_ERROR_SET.has(errorType as string)) {
      console.warn(`Route: [${provider}] ${errorType}:`, error);
    } else {
      console.error(`Route: [${provider}] ${errorType}:`, error);
    }

    return createErrorResponse(errorType, { error, ...res, provider });
  }
});

/**
 * Rough prompt token estimate from message content length.
 * Used only for pre-flight credit estimation (hold amount).
 * The actual charge uses provider-reported usage via onUsage callback.
 */
function estimatePromptTokens(data: ChatStreamPayload): number {
  const messages = data.messages ?? [];
  let charCount = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      charCount += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (typeof part === 'string') charCount += part.length;
        else if (part && typeof part === 'object' && 'text' in part)
          charCount += (part.text as string)?.length ?? 0;
      }
    }
  }
  // ~4 chars per token is a conservative English estimate
  return Math.max(1, Math.ceil(charCount / 4));
}
