# Stage 3：APISIX + RS256 JWT（推荐）

## 1. 生成密钥对

```bash
openssl genrsa -out wedai-jwt-private.pem 2048
openssl rsa -in wedai-jwt-private.pem -pubout -out wedai-jwt-public.pem
```

- 私钥：仅后端签发使用
- 公钥：配置到 APISIX Consumer

## 2. 后端签发示例（Node.js）

```ts
import jwt from "jsonwebtoken";
import fs from "fs";

const privateKey = fs.readFileSync("./wedai-jwt-private.pem");

export function signToken(user: {
  id: string;
  email: string;
  role: string;
  plan?: string;
}) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan || "free",
    },
    privateKey,
    {
      algorithm: "RS256",
      expiresIn: "24h",
      issuer: "wedai",
      audience: "wedai-api",
    }
  );
}
```

## 3. APISIX Consumer

```bash
PUBLIC_KEY_JSON=$(jq -Rs . < wedai-jwt-public.pem)

curl "http://127.0.0.1:9180/apisix/admin/consumers/wedai-user" \
  -H "X-API-KEY: wedai-apisix-admin-key-change-me" -X PUT -d "{
  \"username\": \"wedai-user\",
  \"plugins\": {
    \"jwt-auth\": {
      \"key\": \"wedai-jwt-key\",
      \"algorithm\": \"RS256\",
      \"public_key\": ${PUBLIC_KEY_JSON},
      \"exp\": 86400
    }
  }
}"
```

## 4. 受保护路由示例

```bash
curl "http://127.0.0.1:9180/apisix/admin/routes/3" \
  -H "X-API-KEY: wedai-apisix-admin-key-change-me" -X PUT -d '{
  "name": "wedai-protected",
  "uris": ["/api/chat/*", "/api/user/*", "/api/billing/*"],
  "upstream_id": "1",
  "enable_websocket": true,
  "plugins": {
    "jwt-auth": {
      "header": "Authorization",
      "hide_credentials": false
    },
    "proxy-rewrite": {
      "headers": {
        "X-User-Id": "$jwt_claim_sub",
        "X-User-Email": "$jwt_claim_email",
        "X-User-Role": "$jwt_claim_role",
        "X-User-Plan": "$jwt_claim_plan"
      }
    },
    "limit-count": {
      "count": 120,
      "time_window": 60,
      "rejected_code": 429,
      "key_type": "var",
      "key": "http_x_user_id",
      "policy": "local"
    }
  }
}'
```

生产环境请修改 Admin Key，并限制 9180 访问范围。
