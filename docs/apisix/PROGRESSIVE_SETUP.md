# Wedai 渐进式引入 APISIX

## 阶段概览

| 阶段 | 目标 |
|------|------|
| Stage 1 | 纯反向代理，业务零改动 |
| Stage 2 | 限流、CORS、Prometheus |
| Stage 3 | JWT（推荐 RS256）鉴权 |

假设上游服务容器名为 `wedai`，端口 `3210`。Admin Key 见 `apisix/config.yaml`。

## Stage 1：创建上游与主路由

```bash
curl "http://127.0.0.1:9180/apisix/admin/upstreams/1" \
  -H "X-API-KEY: wedai-apisix-admin-key-change-me" -X PUT -d '{
  "name": "wedai-upstream",
  "type": "roundrobin",
  "nodes": { "wedai:3210": 1 },
  "timeout": { "connect": 6, "send": 60, "read": 60 }
}'

curl "http://127.0.0.1:9180/apisix/admin/routes/1" \
  -H "X-API-KEY: wedai-apisix-admin-key-change-me" -X PUT -d '{
  "name": "wedai-main",
  "uri": "/*",
  "upstream_id": "1",
  "enable_websocket": true,
  "plugins": {
    "cors": {
      "allow_origins": "**",
      "allow_methods": "**",
      "allow_headers": "**",
      "allow_credential": true
    }
  }
}'
```

## Stage 2：限流 + 监控

对路由 PATCH 增加 `limit-count` 与 `prometheus` 插件（详见项目讨论记录）。

## Stage 3：JWT

见 `docs/apisix/JWT_RS256.md`。

公开路径与受保护路径建议拆成不同 route，避免登录/注册被 JWT 拦截。
