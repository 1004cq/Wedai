/**
 * Chat billing middleware — hooks into the model-call path WITHOUT modifying
 * packages/agent-runtime or model-runtime.
 *
 * ## Why this insertion point?
 *
 * The `webapi/chat/[provider]/route.ts` already uses `checkAuth` which gives us
 * `userId` + `serverDB`.  The existing `chargeBeforeGenerate/chargeAfterGenerate`
 * pattern in `packages/business-server` proves this package is the intended hook
 * layer for commercial logic.  We follow the same pattern:
 *
 *   1. `chargeBeforeChat` — called BEFORE `modelRuntime.chat()`:
 *      - Resolves charge mode (BYOK → skip)
 *      - Freezes price snapshot, estimates credits
 *      - Atomically holds credits (fails with 402 if insufficient)
 *      - Returns a `ChatBillingContext` for the after-hook
 *
 *   2. `chargeAfterChat` — called AFTER response completes:
 *      - On success: normalises usage, settles actual credits, writes usage_record
 *      - On failure/abort: releases the hold entirely, net charge = 0
 *
 * ## Idempotency
 *
 * The caller supplies a `requestId` (from `X-Request-Id` header or generated).
 * All billing operations derive deterministic idempotency keys from it, so:
 *   - Retries with the same requestId never double-hold or double-debit.
 *   - The `usage_records (request_id, billing_account_id)` unique index is
 *     the final safety net at the DB level.
 *
 * ## Sequence diagram (text)
 *
 * ```
 * Client ─── POST /webapi/chat/openai ──→ checkAuth
 *                                            │
 *                                  ┌─── chargeBeforeChat ───┐
 *                                  │  resolveChargeMode()   │
 *                                  │  if BYOK → return skip │
 *                                  │  estimateCredits()     │
 *                                  │  billingService.hold() │←── PRECONDITION_FAILED → 402
 *                                  └────────────────────────┘
 *                                            │
 *                                  ┌── modelRuntime.chat() ─┐
 *                                  │  stream / non-stream   │
 *                                  └────────────────────────┘
 *                                            │
 *                               ┌─── chargeAfterChat ───────┐
 *                               │  if success:              │
 *                               │    normalize(usage)       │
 *                               │    computeCredits()       │
 *                               │    billingService.settle()│
 *                               │    write usage_record     │
 *                               │  if error:               │
 *                               │    billingService.release()│
 *                               └───────────────────────────┘
 * ```
 */
export { chargeAfterChat } from './chargeAfterChat';
export { chargeBeforeChat, type ChatBillingContext, InsufficientBalanceError } from './chargeBeforeChat';
