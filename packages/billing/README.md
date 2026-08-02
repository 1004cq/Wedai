# `packages/billing`

Reserved for provider-neutral commercial domain logic.

Planned responsibilities include pricing snapshots, quota policies, usage normalization, money and
token units, idempotency contracts, ledger commands, invoice calculation, and payment-provider ports.
Runtime/provider SDK code must not depend on this package; application middleware will translate
runtime usage into billing commands.

This directory intentionally contains no executable package yet. Add `package.json`, source code, and
tests only when the Phase 1 domain model is approved.
