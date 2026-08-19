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
import { BillingAccountModel, modelPrices } from '@lobechat/database';
import type { LobeChatDatabase } from '@lobechat/database';
import { and, eq, isNull } from 'drizzle-orm';

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

// ─── Config defaults (used when no model_prices row exists) ──────────────────

const DEFAULT_PROMPT_CREDITS_PER_K = 1n;
const DEFAULT_COMPLETION_CREDITS_PER_K = 2n;
const DEFAULT_CURRENCY = 'CNY';

/** Look up active model price from DB; fall back to defaults if not configured. */
async function resolveModelPrice(
  db: LobeChatDatabase,
  modelId: string,
  provider: string,
): Promise<{ promptPerK: bigint; completionPerK: bigint }> {
  const [row] = await db
    .select({
      promptCreditsPerKToken: modelPrices.promptCreditsPerKToken,
      completionCreditsPerKToken: modelPrices.completionCreditsPerKToken,
    })
    .from(modelPrices)
    .where(
      and(
        eq(modelPrices.modelId, modelId),
        eq(modelPrices.provider, provider),
        eq(modelPrices.isActive, true),
        isNull(modelPrices.archivedAt),
      ),
    )
    .limit(1);

  return {
    promptPerK: row?.promptCreditsPerKToken ?? DEFAULT_PROMPT_CREDITS_PER_K,
    completionPerK: row?.completionCreditsPerKToken ?? DEFAULT_COMPLETION_CREDITS_PER_K,
  };
}

// ─── Implementation ───────────────────────────────────────────────────────────

export async function chargeBeforeChat(params: ChargeBeforeChatParams): Promise<ChatBillingContext> {
  validateRequestId(params.requestId);

  // 1. Resolve charge mode.
  // byokAllowed and gatewayFeeEnabled are read from env so they can be changed
  // without a code deploy. Defaults: BYOK=allowed, gateway_fee=disabled.
  const billingCtx: BillingContext = {
    byokAllowed: process.env.BYOK_ALLOWED !== 'false',
    gatewayFeeEnabled: process.env.BYOK_GATEWAY_FEE_ENABLED === 'true',
    isPlatformManagedProvider: false, // Phase 3: read per-provider from admin config table
    provider: params.provider,
    userHasProviderKey: params.userHasProviderKey,
  };

  const { chargeMode } = resolveChargeMode(billingCtx);

  if (chargeMode === 'byok') {
    // User supplied their own API key for this provider.
    // Platform credits are NOT deducted — no hold, settle, or release.
    // See docs/commercial/BYOK.md for the full decision tree.
    return {
      charged: false,
      billingAccountId: '',
      heldCredits: 0n,
      holdResult: null,
      priceSnapshot: null,
      requestId: params.requestId,
    };
  }

  // 2. Get or create billing account.
  const bam = new BillingAccountModel(params.db, params.userId);
  let account = await bam.findByUserId();
  if (!account) {
    account = await bam.createForUser({ currency: DEFAULT_CURRENCY });
  }

  // 3. Read model price from DB (or fallback defaults).
  const { promptPerK, completionPerK } = await resolveModelPrice(
    params.db,
    params.modelId,
    params.provider,
  );

  // Use the higher of prompt/completion rate for the conservative upper-bound.
  const maxRatePerK = completionPerK > promptPerK ? completionPerK : promptPerK;

  const priceSnapshot = PriceSnapshotService.buildUsagePriceSnapshot({
    unitType: 'total_token',
    creditsPerThousandTokens: maxRatePerK,
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
