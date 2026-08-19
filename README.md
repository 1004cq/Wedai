# Wedai

基于 [LobeHub](https://github.com/lobehub/lobehub) 的商业化二次开发（方案 C：自主扩展，尽量不改官方 runtime 核心）。

补齐：**用户体系 · 套餐/积分计费 · 支付 · 管理后台**，形成可独立运营的 AI Agent 服务。

| 项 | 说明 |
|----|------|
| 上游基线 | LobeHub `canary` |
| 维护者 | [@1004cq](https://github.com/1004cq) |
| 文档入口 | **[docs/DOCS_INDEX.md](./docs/DOCS_INDEX.md)** |
| 一键部署 | **[deploy/ONE_CLICK.md](./deploy/ONE_CLICK.md)** |
| 仓库目录说明 | **[docs/REPO_LAYOUT.md](./docs/REPO_LAYOUT.md)** |

---

## 快速开始

### 一键部署（推荐体验栈）

```bash
./deploy/one-click-up.sh
```

首次会生成 `deploy/.env.commercial`，填完密钥后再执行一次。默认 <http://localhost:3210>。  
详情见 [deploy/ONE_CLICK.md](./deploy/ONE_CLICK.md)。

> Phase 1+2 已实现文本/生图/视频扣费、Stripe 支付闭环、Admin RBAC 与用户计费页。部署后运行 `pnpm db:migrate && pnpm db:seed:dev` 即可开始本地验收，完整步骤见 [docs/qa/LOCAL_P0_RUNBOOK.md](./docs/qa/LOCAL_P0_RUNBOOK.md)。

### 本地开发（上游标准）

```bash
pnpm install --frozen-lockfile
cp .env.example.development .env.development.local
pnpm dev:docker   # 依赖服务
pnpm db:migrate
bun run dev       # 或 pnpm 文档中的 dev 命令
```

---

## 能力与状态（Phase 1+2，commit `15eb1f3`）

| 能力 | 状态 | 关键路径 |
|------|------|----------|
| LobeHub Agent / 对话 / 设置 / BYOK | ✅ 上游已有，可运行 | `packages/agent-runtime` |
| Better Auth 邮箱登录注册 | ✅ 已可测 | `src/features/Auth/` |
| 商业 DB 表（10 张）+ migrations 0132–0136 | ✅ 已实现 | `packages/database/src/schemas/billing.ts` |
| packages/billing 领域包（hold/settle/release/credit/BYOK/幂等） | ✅ 已实现 | `packages/billing/src/` |
| Stripe Checkout + Webhook（幂等验签入账） | ✅ 已实现 | `apps/server/src/services/payment/`，`src/app/(backend)/api/webhooks/stripe/route.ts` |
| topUp / spend / subscription tRPC | ✅ 已实现 | `packages/business-server/src/lambda-routers/` |
| 文本对话扣费（chargeBeforeChat/After，流式 onUsage 真实 token） | ✅ 已实现 | `packages/business-server/src/chat-billing/` |
| 图片 / 视频扣费（requestCreditsFlat，fail-closed） | ✅ 已实现 | `packages/business-server/src/{image,video}-generation/` |
| Hold 超时自动 release（StaleHoldReaper，30 分钟） | ✅ 已实现 | `packages/database/src/models/staleHoldReaper.ts` |
| Admin RBAC + tRPC（users/orders/ledger/pricing/adjustments/webhooks/config） | ✅ 已实现 | `apps/server/src/routers/lambda/admin/` |
| 用户定价页 / 积分页 / 账单页（接真实 tRPC，Checkout 轮询） | ✅ 已实现 | `src/business/client/BusinessSettingPages/` |
| 余额不足 UX（402 + PlanLimitCard + 跳转 /settings/plans） | ✅ 已实现 | `src/features/Conversation/Error/PlanLimitCard/` |
| 注册赠送积分（SIGNUP_CREDIT_GRANT，幂等） | ✅ 已实现 | `packages/business-server/src/user.ts` |
| Docker 一键栈（app + PG + Redis + 对象存储） | ✅ 可用 | `deploy/` |
| Agent 多步 LLM 计费（ServerLLMTransport） | ❌ 未接线 | Phase 3 |
| 国内支付 / 手机短信注册 / Referral | ❌ 未实现 | Phase 5 |
| Admin 仪表盘聚合指标 | ❌ 占位（info banner） | `pages/DashboardPage.tsx` |

产品约定：

- **平台模型**：走服务端 Key，扣平台积分  
- **用户自配 API（BYOK）**：设置里填自己的 Key，默认不扣平台积分  

详见 [docs/commercial/OVERVIEW.md](./docs/commercial/OVERVIEW.md)、[docs/commercial/BYOK.md](./docs/commercial/BYOK.md)。

---

## 文档怎么读

1. **[docs/DOCS_INDEX.md](./docs/DOCS_INDEX.md)** — Wedai 全部文档索引  
2. **[docs/REPO_LAYOUT.md](./docs/REPO_LAYOUT.md)** — 哪些目录是上游、哪些是商业扩展  
3. **[docs/qa/ACCEPTANCE_USER_BILLING.md](./docs/qa/ACCEPTANCE_USER_BILLING.md)** — 付费上线验收  
4. **[docs/IMPORT_LOBEHUB.md](./docs/IMPORT_LOBEHUB.md)** — 与官方同步方式  

上游 LobeHub 功能说明、插件、社区部署等仍可看：

- [README.zh-CN.md](./README.zh-CN.md)（官方中文说明，导入保留）  
- `docs/usage/`、`docs/self-hosting/`（官方文档树）

---

## 开发边界（必读）

1. **尽量不改** `packages/agent-runtime`、`packages/model-runtime` 核心；计费用外围中间件切入。  
2. 商业代码优先落在：`packages/billing`、`src/features/billing`、`src/features/admin`、`src/features/user-center`、`deploy/`、`docs/commercial|qa|architecture`。  
3. 支付密钥、SMTP、短信凭据：**服务端保存、掩码回显、禁止进前端包与公开 MD**。  
4. License：LobeHub Community License；对外商业化请联系 `hello@lobehub.com`。

---

## 目录速览

```text
Wedai/
├── deploy/                 # 【Wedai】一键商业部署
├── docs/
│   ├── commercial/         # 【Wedai】产品与后台约定
│   ├── architecture/       # 【Wedai】实时通信、聊天优化
│   ├── qa/                 # 【Wedai】验收
│   ├── DOCS_INDEX.md       # 【Wedai】文档入口
│   ├── REPO_LAYOUT.md      # 【Wedai】仓库布局说明
│   └── usage|self-hosting… # 【上游】官方文档
├── apisix/                 # 【Wedai】网关配置（可选）
├── src/features/
│   ├── admin|billing|user-center  # 【Wedai】商业功能（Phase 1+2 已实现）
│   └── …                   # 【上游】对话、Agent、设置等
├── packages/               # 上游 monorepo + 可扩展 billing
├── apps/                   # 上游应用
└── README.zh-CN.md         # 上游中文 README（保留）
```

更细说明见 [docs/REPO_LAYOUT.md](./docs/REPO_LAYOUT.md)。

---

**Wedai** — 在官方 Agent 能力之上，把可运营的商业闭环补齐。
