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

## Routes and implementation

See [docs/commercial/ADMIN_UI.md](../../../docs/commercial/ADMIN_UI.md) for the product rules and route plan.

The Web SPA UI and its API-shaped mock are implemented in [`admin-ui`](./admin-ui/README.md) and mounted at `/admin/*`.

## Status

The mock-first Admin UI is implemented on the Web SPA. Server-side Better Auth permission enforcement, persistent billing data, and tRPC integration remain required before production use.
