/**
 * Agent billing adapter — wraps ServerLLMTransport to add hold/settle/release
 * around every LLM call in the agent/multi-step path.
 *
 * ## Why here and not in agent-runtime
 *
 * `ServerLLMTransport` lives in `apps/server` (not in `packages/agent-runtime`),
 * so we can wrap it without touching the core package.  The adapter is injected
 * by `createRuntimeExecutors` which already builds the transport.
 *
 * ## Sequence per step
 *
 *   1. Derive requestId from `operationId:stepIndex:attempt` (deterministic, idempotent).
 *   2. chargeBeforeChat — BYOK → skip; platform → hold estimatedCredits.
 *   3. Execute the underlying LLM call (runAttempt / stream).
 *   4a. Success → chargeAfterChat(success=true, real usage from response).
 *   4b. Error  → chargeAfterChat(success=false) → release hold.
 *
 * ## BYOK detection
 *
 * The adapter checks `modelRuntime.baseURL` (non-undefined = user-supplied
 * endpoint = BYOK), which is the same heuristic used in the webapi/chat route.
 *
 * ## Fail mode
 *
 * If billing fails due to PRECONDITION_FAILED (insufficient balance):
 *   - The error is surfaced to the agent as a normal error (step fails).
 *   - The agent's error-handling path marks the operation failed.
 *   - No LLM provider is called.
 *
 * If billing fails for any other reason (DB error, etc.):
 *   - By default we log and proceed (fail-open for agent reliability).
 *   - Set env AGENT_BILLING_STRICT=true to fail-closed (block provider call).
 */
import debug from 'debug';

import { chargeAfterChat, chargeBeforeChat, InsufficientBalanceError } from '@/business/server/chat-billing';
import { initModelRuntimeFromDB } from '@/server/modules/ModelRuntime';

import type { RuntimeExecutorContext } from '../context';

const log = debug('lobe-server:billing:agent');

/**
 * Whether billing errors (other than insufficient balance) block the agent step.
 * Default: false (fail-open for reliability).
 * Set AGENT_BILLING_STRICT=true for production fail-closed behaviour.
 */
const isStrict = () => process.env.AGENT_BILLING_STRICT === 'true';

/**
 * Derives a deterministic, idempotent requestId for a single agent LLM attempt.
 * Format: `agent:{operationId}:{stepIndex}:{attempt}`
 */
export function agentRequestId(ctx: RuntimeExecutorContext, attempt = 0): string {
  return `agent:${ctx.operationId}:${ctx.stepIndex}:${attempt}`;
}

/**
 * Wraps an agent LLM call with pre-flight billing hold and post-call settle/release.
 *
 * @param ctx  The RuntimeExecutorContext (has userId, serverDB, operationId, stepIndex).
 * @param provider  The provider slug (e.g. "openai").
 * @param model     The model ID (e.g. "gpt-4o").
 * @param attempt   The attempt index within this step (for idempotency).
 * @param promptTokenEstimate  A rough estimate of prompt tokens (used for hold sizing).
 * @param maxCompletionTokens  The model's max_tokens setting.
 * @param call  The actual LLM call to execute.
 * @returns The result of the call.
 */
export async function withAgentBilling<T extends { usage?: { inputTextTokens?: number; outputTextTokens?: number; totalTokens?: number } | undefined }>(
  ctx: RuntimeExecutorContext,
  provider: string,
  model: string,
  attempt: number,
  promptTokenEstimate: number,
  maxCompletionTokens: number,
  call: () => Promise<T>,
): Promise<T> {
  if (!ctx.userId || !ctx.serverDB) {
    // No billing context available (e.g. system/eval runs).
    return call();
  }

  const requestId = agentRequestId(ctx, attempt);

  // Detect BYOK: if the model runtime has a user-supplied baseURL the user pays the provider directly.
  let userHasProviderKey = false;
  try {
    const modelRuntime = await initModelRuntimeFromDB(ctx.serverDB, ctx.userId, provider, ctx.workspaceId);
    userHasProviderKey = modelRuntime.baseURL !== undefined;
  } catch {
    // Can't detect key — default to platform billing.
  }

  let billingContext: Awaited<ReturnType<typeof chargeBeforeChat>>;
  try {
    billingContext = await chargeBeforeChat({
      db: ctx.serverDB,
      estimatedPromptTokens: promptTokenEstimate,
      maxCompletionTokens,
      modelId: model,
      provider,
      requestId,
      userId: ctx.userId,
      userHasProviderKey,
    });
  } catch (err) {
    if (err instanceof InsufficientBalanceError) {
      log('insufficient_balance %O', { attempt, model, outcome: '402', provider, stepIndex: ctx.stepIndex });
      throw err; // surface to agent — step fails cleanly
    }
    log('hold_error %O', { attempt, err: (err as Error).message, model, outcome: 'error', provider, stepIndex: ctx.stepIndex });
    if (isStrict()) throw err;
    // Fail-open: proceed without billing.
    return call();
  }

  let result: T;
  try {
    result = await call();
  } catch (providerError) {
    await chargeAfterChat({
      billingContext,
      db: ctx.serverDB,
      modelId: model,
      provider,
      success: false,
      userId: ctx.userId,
    });
    throw providerError;
  }

  void chargeAfterChat({
    billingContext,
    db: ctx.serverDB,
    modelId: model,
    provider,
    rawUsage: result.usage
      ? {
          completionTokens: result.usage.outputTextTokens,
          promptTokens: result.usage.inputTextTokens,
          totalTokens: result.usage.totalTokens,
        }
      : undefined,
    success: true,
    userId: ctx.userId,
  });

  return result;
}
