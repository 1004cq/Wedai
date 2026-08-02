# APISIX integration

APISIX is an optional edge layer for Wedai. The first deployment should proxy only a small set of
stateless HTTP routes while the application remains responsible for authentication, authorization,
billing decisions, and durable usage records.

## Local start

```bash
docker compose -f docker-compose.apisix.yml up -d
docker compose -f docker-compose.apisix.yml ps
```

- Proxy listener: `http://localhost:9080`
- Admin API: `http://127.0.0.1:9180`
- Configuration: `apisix/config.yaml`

Before creating routes, replace `CHANGE_ME_BEFORE_PRODUCTION` in `apisix/config.yaml`. The checked-in
value is deliberately unusable as a production secret.

Example route for a local Wedai backend on port 3010:

```bash
curl http://127.0.0.1:9180/apisix/admin/routes/wedai-api \
  -H 'X-API-KEY: CHANGE_ME_BEFORE_PRODUCTION' \
  -X PUT \
  -d '{
    "uri": "/api/*",
    "methods": ["GET", "POST", "PUT", "PATCH", "DELETE"],
    "upstream": {
      "type": "roundrobin",
      "nodes": { "host.docker.internal:3010": 1 }
    }
  }'
```

Do not enable gateway-side billing as the source of truth. APISIX may reject obviously invalid or
over-limit traffic, but the application middleware and database ledger own final charging decisions.

## Rollout stages

1. Observe: request IDs, access logs, latency, status codes, and upstream health.
2. Protect: conservative IP/client rate limits and request size limits.
3. Route: selected public APIs, then model endpoints with explicit rollback rules.
4. Optimize: caching only for safe, non-user-specific responses.

See `SECURITY.md` in this directory before exposing the Admin API or proxy publicly.
