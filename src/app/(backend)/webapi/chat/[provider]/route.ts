import { REQUEST_TOPIC_ID_HEADER } from '@lobechat/const';
import { type ChatCompletionErrorPayload } from '@lobechat/model-runtime';
import { AGENT_RUNTIME_ERROR_SET, awaitFirstResponseChunk } from '@lobechat/model-runtime';
import { ChatErrorType, type ModelTokensUsage } from '@lobechat/types';
import { eq } from 'drizzle-orm';

import { checkAuth } from '@/app/(backend)/middleware/auth';
import {
  chargeAfterChat,
  chargeBeforeChat,
  InsufficientBalanceError,
} from '@/business/server/chat-billing';
import { users } from '@/database/schemas';
import { initModelRuntimeForRequest } from '@/server/modules/AgentRuntime/llmRelay/oneShot';
import { runRouteWithLlmRelayRequest } from '@/server/modules/AgentRuntime/llmRelay/requestScope';
import { createTraceOptions } from '@/server/modules/ModelRuntime';
import { type ChatStreamPayload } from '@/types/openai/chat';
import { createErrorResponse } from '@/utils/errorResponse';
import { getTracePayload } from '@/utils/trace';

import { resolveValidWorkspaceIdFromRequest } from '../../_utils/workspace';

// If user don't use fluid compute, will build  failed
// this enforce user to enable fluid compute
export const maxDuration = 300;

export const POST = checkAuth(async (req: Request, { params, userId, serverDB }) => {
  const provider = (await params)!.provider!;
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();

  try {
    const workspaceId = await resolveValidWorkspaceIdFromRequest({ req, serverDB, userId });

    // ============  0. banned check (fresh DB; cookie cache can be stale)  ============ //
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

    // A provider only the user's device reaches is relayed back to the
    // requesting tab (one-shot relay); the channel stays open while the
    // response streams.
    return await runRouteWithLlmRelayRequest(req, userId, async () => {
      // ============  1. init chat model   ============ //
      const modelRuntime = await initModelRuntimeForRequest(serverDB, userId, provider, {
        workspaceId,
      });

      // ============  2. parse payload  ============ //
      const data = (await req.json()) as ChatStreamPayload;
      const modelId = data.model ?? '';

      // ============  3. billing: pre-flight hold  ============ //
      // Platform admin/env keys are not BYOK. Until we pass an explicit
      // "user vault has apiKey" flag from init, never mark BYOK here.
      const billingContext = await chargeBeforeChat({
        db: serverDB,
        estimatedPromptTokens: estimatePromptTokens(data),
        maxCompletionTokens: data.max_tokens ?? 4096,
        modelId,
        provider,
        requestId,
        userId,
        userHasProviderKey: false,
      });

      // ============  4. create chat completion  ============ //
      const tracePayload = getTracePayload(req);

      let traceOptions = {};
      if (tracePayload?.enabled) {
        traceOptions = createTraceOptions(data, { provider, trace: tracePayload });
      }

      let capturedUsage: ModelTokensUsage | undefined;
      let response: Response;
      try {
        response = await modelRuntime.chat(data, {
          user: userId,
          ...traceOptions,
          callback: {
            onUsage: (usage) => {
              capturedUsage = usage;
            },
          },
          metadata: { topicId: req.headers.get(REQUEST_TOPIC_ID_HEADER) ?? undefined },
          signal: req.signal,
        });
      } catch (providerError) {
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
      void chargeAfterChat({
        billingContext,
        db: serverDB,
        modelId,
        provider,
        rawUsage,
        success: true,
        userId,
      });

      // A routed chat can fail before its first byte (e.g. an empty completion); surface that
      // as the structured error below instead of the framework's 500 page.
      return await awaitFirstResponseChunk(response);
    });
  } catch (e) {
    if (e instanceof InsufficientBalanceError) {
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

    // track the error at server side
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
  return Math.max(1, Math.ceil(charCount / 4));
}
