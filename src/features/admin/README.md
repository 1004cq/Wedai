# Admin feature

Role-protected commercial operations console for Wedai.

## Scope

- Account lookup, grants/refunds, order and webhook inspection
- Pricing rollout, payment / SMTP / SMS system config
- Audit history for every privileged mutation

## Rules

Every mutation requires:

1. Explicit permission check (server-side, default deny)
2. Human-readable reason
3. Idempotency key
4. Immutable audit record

Secrets (payment keys, SMTP password, SMS AccessKey) must never be echoed in API responses or logs after save — only a configured boolean.

## Planned routes

See [docs/commercial/ADMIN_UI.md](../../../docs/commercial/ADMIN_UI.md).

## Status

Main branch currently holds this placeholder. Full UI may live on a feature branch or local mock until tRPC billing routers and RBAC middleware are ready.
