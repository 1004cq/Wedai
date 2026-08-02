# Wedai database extensions

Commercial tables should extend this existing Drizzle/PostgreSQL package without changing Better Auth
identity semantics.

## Phase 1 candidate model

- `billing_accounts`: one owner (user initially, workspace later), currency, status, and version.
- `plans` and `plan_prices`: immutable/versioned entitlements and price snapshots.
- `subscriptions`: plan lifecycle, provider references, billing periods, and cancellation state.
- `orders` and `payment_attempts`: internal order state separated from provider delivery attempts.
- `wallets`: cached available/reserved amounts for fast reads, never the audit source of truth.
- `ledger_entries`: append-only debit, credit, grant, hold, release, refund, and expiry entries.
- `usage_records`: normalized model usage with model/provider, token classes, request ID, and price
  snapshot.
- `webhook_events`: verified provider events with unique provider/event IDs and processing status.

## Required invariants

- Use integer minor currency units and integer token units; avoid floating-point money.
- Every external request and webhook has a unique idempotency key.
- Balance-affecting operations are transactional and produce immutable ledger entries.
- Provider payloads are retained only after secret/PII scrubbing and have a retention policy.
- Schema, migration, repository, concurrency, and reconciliation tests ship together.

Prefer new schema modules under `packages/database/src/schemas` and server models under
`packages/database/src/server/models`. Do not add commercial columns directly to Better Auth tables
unless identity behavior genuinely requires them.
