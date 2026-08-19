/**
 * chargeBeforeChat — pre-flight billing check and credit hold.
 *
 * Called before modelRuntime.chat(). If it throws `InsufficientBalanceError`,
 * the caller MUST NOT call the provider.
 */
import {
  BillingCommandService,
  PriceSnapshotService,
  UsageNormalizer,
  resolveChargeMode,
  validateRequestId,
} from '@lobechat/billing';
import type { BillingContext, HoldResult, UsagePriceSnapshot } from '@lobechat/billing';
import { BillingAccountModel } from '@lobechat/database';
import type { LobeChatDatabase } from '@lobechat/database';

// ─── Error types ──────────────────────────────────────────────────────────────

export class InsufficientBalanceError extends Error {
  constructor() {
    super('Insufficient credits — please top up your balance');
    this.name = 'InsufficientBalanceError';
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Opaque context carried from chargeBeforeChat → chargeAfterChat.
 * The chat route just passes it through; it never reads the fields.
 */
export interface ChatBillingContext {
  /** Whether billing was applied (false when BYOK). */
  charged: boolean;
  billingAccountId: string;
  requestId: string;
  holdResult: HoldResult | null;
  heldCredits: bigint;
  priceSnapshot: UsagePriceSnapshot | null;
}

// ─── Params ───────────────────────────────────────────────────────────────────

export interface ChargeBeforeChatParams {
  db: LobeChatDatabase;
  userId: string;
  /** Application-level request idempotency key. */
  requestId: string;
  provider: string;
  modelId: string;
  /**
   * Whether the user has a valid API key for this provider stored in keyVaults.
   * The caller (route/middleware) checks this; this module trusts the boolean.
   */
  userHasProviderKey: boolean;
  /** Estimated prompt tokens (from tokenizer or char heuristic). */
  estimatedPromptTokens: number;
  /** Max completion tokens from the request payload. */
  maxCompletionTokens: number;
}

// ─── Config (will be admin-configurable later; hardcoded MVP defaults) ────────

const DEFAULT_CREDITS_PER_THOUSAND_TOKENS = 1n;
const DEFAULT_CURRENCY = 'CNY';

// ─── Implementation ───────────────────────────────────────────────────────────

export async function chargeBeforeChat(params: ChargeBeforeChatParams): Promise<ChatBillingContext> {
  validateRequestId(params.requestId);

  // 1. Resolve charge mode.
  const billingCtx: BillingContext = {
    provider: params.provider,
    userHasProviderKey: params.userHasProviderKey,
    isPlatformManagedProvider: false, // TODO: read from admin config
    byokAllowed: true,               // TODO: read from admin config
    gatewayFeeEnabled: false,        // TODO: read from admin config
  };

  const { chargeMode } = resolveChargeMode(billingCtx);

  if (chargeMode === 'byok') {
    return {
      charged: false,
      billingAccountId: '',
      requestId: params.requestId,
      holdResult: null,
      heldCredits: 0n,
      priceSnapshot: null,
    };
  }

  // 2. Get or create billing account.
  const bam = new BillingAccountModel(params.db, params.userId);
  let account = await bam.findByUserId();
  if (!account) {
    account = await bam.createForUser({ currency: DEFAULT_CURRENCY });
  }

  // 3. Build price snapshot for token-based billing.
  const priceSnapshot = PriceSnapshotService.buildUsagePriceSnapshot({
    unitType: 'total_token',
    creditsPerThousandTokens: DEFAULT_CREDITS_PER_THOUSAND_TOKENS,
    currency: DEFAULT_CURRENCY,
  });

  // 4. Estimate upper-bound credits.
  const estimatedCredits = UsageNormalizer.estimateCredits(
    {
      promptTokens: params.estimatedPromptTokens,
      maxCompletionTokens: params.maxCompletionTokens,
    },
    priceSnapshot,
  );

  // Zero-credit requests (very short prompts) still go through without a hold.
  if (estimatedCredits <= 0n) {
    return {
      charged: true,
      billingAccountId: account.id,
      requestId: params.requestId,
      holdResult: null,
      heldCredits: 0n,
      priceSnapshot,
    };
  }

  // 5. Atomic hold — throws PRECONDITION_FAILED if insufficient balance.
  const billingService = new BillingCommandService(params.db);
  let holdResult: HoldResult;
  try {
    holdResult = await billingService.hold({
      billingAccountId: account.id,
      requestId: params.requestId,
      reason: `chat:${params.provider}:${params.modelId}`,
      estimatedCredits,
      priceSnapshot,
    });
  } catch (err: any) {
    if (err?.code === 'PRECONDITION_FAILED') {
      throw new InsufficientBalanceError();
    }
    throw err;
  }

  return {
    charged: true,
    billingAccountId: account.id,
    requestId: params.requestId,
    holdResult,
    heldCredits: estimatedCredits,
    priceSnapshot,
  };
}
