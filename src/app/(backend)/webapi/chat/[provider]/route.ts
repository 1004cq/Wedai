import { AGENT_RUNTIME_ERROR_SET, type ChatCompletionErrorPayload } from '@lobechat/model-runtime';
import { ChatErrorType } from '@lobechat/types';

import { checkAuth } from '@/app/(backend)/middleware/auth';
import { InsufficientBalanceError, chargeAfterChat, chargeBeforeChat } from '@/business/server/chat-billing';
import { createTraceOptions, initModelRuntimeFromDB } from '@/server/modules/ModelRuntime';
import { type ChatStreamPayload } from '@/types/openai/chat';
import { createErrorResponse } from '@/utils/errorResponse';
import { getTracePayload } from '@/utils/trace';

import { resolveValidWorkspaceIdFromRequest } from '../../_utils/workspace';

export const maxDuration = 300;

export const POST = checkAuth(async (req: Request, { params, userId, serverDB }) => {
  const provider = (await params)!.provider!;
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();

  try {
    const workspaceId = await resolveValidWorkspaceIdFromRequest({ req, serverDB, userId });

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
      userId,
      requestId,
      provider,
      modelId,
      userHasProviderKey: modelRuntime.baseURL !== undefined,
      estimatedPromptTokens: estimatePromptTokens(data),
      maxCompletionTokens: data.max_tokens ?? 4096,
    });

    // ============  4. create chat completion  ============ //
    const tracePayload = getTracePayload(req);
    let traceOptions = {};
    if (tracePayload?.enabled) {
      traceOptions = createTraceOptions(data, { provider, trace: tracePayload });
    }

    let response: Response;
    try {
      response = await modelRuntime.chat(data, {
        user: userId,
        ...traceOptions,
        signal: req.signal,
      });
    } catch (providerError) {
      // ============  5a. provider error: release hold  ============ //
      await chargeAfterChat({
        db: serverDB,
        userId,
        billingContext,
        success: false,
        modelId,
        provider,
      });
      throw providerError;
    }

    // ============  5b. success: settle credits  ============ //
    // For streaming responses we cannot get final usage here (it's in the stream).
    // We settle with estimated usage; a background reconciliation job can correct later.
    // Non-streaming responses include usage in the body (read from headers if available).
    const usageHeader = response.headers.get('x-usage-total-tokens');
    const rawUsage = usageHeader
      ? { totalTokens: Number.parseInt(usageHeader, 10) }
      : { totalTokens: estimatePromptTokens(data) + (data.max_tokens ?? 4096) };

    // Fire-and-forget settlement (don't block the streaming response).
    void chargeAfterChat({
      db: serverDB,
      userId,
      billingContext,
      success: true,
      rawUsage,
      modelId,
      provider,
    });

    return response;
  } catch (e) {
    if (e instanceof InsufficientBalanceError) {
      // Use InsufficientBudgetForModel — the existing error type the frontend
      // PlanLimitCard component recognises. Attach a budget context snapshot
      // so the card can display the shortfall amount.
      return createErrorResponse(ChatErrorType.InsufficientBudgetForModel, {
        budget: {
          // No plan metadata here — just credits context.
          pricingBasis: 'estimated',
          // requiredCredits / shortfallCredits would need to be carried out of
          // chargeBeforeChat; omitted for now to keep the error path minimal.
        },
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
 * The actual charge uses provider-reported usage.
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
        else if (part && typeof part === 'object' && 'text' in part) charCount += (part.text as string)?.length ?? 0;
      }
    }
  }
  // ~4 chars per token is a conservative English estimate
  return Math.max(1, Math.ceil(charCount / 4));
}
