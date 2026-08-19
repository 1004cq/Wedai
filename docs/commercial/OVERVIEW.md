# Wedai 商业化能力总览

> 状态基准：2026-08-19，commit `589f93d`（Phase 1 合入 main）。已实现的能力有真实代码路径标注；未实现的条目明确标记。

## 1. 产品双模式

用户可在两种调用方式间选择或并存：

| 模式 | API Key 来源 | 费用 | 计费 |
|------|--------------|------|------|
| **平台模型** | 服务端环境变量 / 后台配置 | 用户消耗平台积分或套餐额度 | **扣费**（预占 → 结算 / 释放） |
| **用户自配 API（BYOK）** | 用户在「设置 → 模型服务商」填写 | 用户直接向模型商付费 | **默认不扣平台积分**（可配置网关费） |

上游已具备 BYOK 能力：`src/routes/(main)/settings/provider/**`、`keyVaults` + `KEY_VAULTS_SECRET`。

商业化实现计费中间件时必须按「是否用户自带 Key」分支，避免对 BYOK 请求误扣费。

## 2. 用户注册通道

- 邮箱注册 / 登录（Better Auth，已可测）
- 手机号注册 / 登录（需 Admin 配置短信 API 后启用）
- 支持邮箱 + 手机号双通道；用户列表可按邮箱 / 手机 / 昵称搜索

## 3. 管理后台规划能力

| 模块 | 路由建议 | 权限点 | 说明 |
|------|----------|--------|------|
| 仪表盘 | `/admin` | `admin:dashboard:read` | 今日充值、消耗、新增用户 |
| 用户 | `/admin/users` | `billing:users:*` | 搜索、封禁、调账、角色 |
| 订单 | `/admin/orders` | `billing:orders:read` | 订单状态、支付渠道 |
| 流水 | `/admin/ledger` | `billing:ledger:read` | 不可变账本 |
| 模型价格 | `/admin/prices` | `billing:prices:config` | Token / 按次 |
| 支付配置 | `/admin/payment` | `billing:payment:config` | 支付宝 RSA2 等；密钥掩码不回显 |
| 邮箱 SMTP | `/admin/email` | `system:email:config` | 预设 Gmail/Outlook/QQ/163 等 |
| 短信 API | `/admin/sms` | `system:sms:config` | 阿里云 / 腾讯云 / 自定义 |
| 审计 | `/admin/audit` | `admin:audit:read` | 管理操作日志 |

安全约定：

- 密钥类字段保存后只返回「已配置」布尔值，不回显明文
- 更新时仅当提交非空字符串才覆盖密钥
- 所有写操作写审计日志 + 幂等键

## 4. 计费与支付（实现状态，Phase 1）

| 能力 | 状态 | 关键路径 |
|------|------|----------|
| 商业 DB 表（9 张）+ migrations 0132–0134 | ✅ 已实现 | `packages/database/src/schemas/billing.ts` |
| packages/billing 领域包（hold/settle/release/credit/BYOK/幂等键） | ✅ 已实现 | `packages/billing/src/` |
| Stripe Checkout Session 创建（服务端价格快照） | ✅ 已实现 | `apps/server/src/services/payment/StripePaymentService.ts` |
| Stripe Webhook（原始 body 验签、幂等入账、状态机） | ✅ 已实现 | `src/app/(backend)/api/webhooks/stripe/route.ts` |
| topUp tRPC（createOrder / getOrder / cancelOrder） | ✅ 已实现 | `packages/business-server/src/lambda-routers/topUp.ts` |
| spend tRPC（balance / ledgerHistory / usageHistory） | ✅ 已实现 | `packages/business-server/src/lambda-routers/spend.ts` |
| subscription tRPC（getActive / listPlans） | ✅ 已实现 | `packages/business-server/src/lambda-routers/subscription.ts` |
| 文本对话扣费中间件（BYOK 跳过 / 预占 / 结算 / 释放） | ✅ 已实现 | `packages/business-server/src/chat-billing/` |
| model_prices 表（Admin 可配 per-model 积分费率） | ✅ 已实现 | `packages/database/src/schemas/billing.ts`，migration 0134 |
| Admin RBAC（默认拒绝，DB 角色校验） | ✅ 已实现 | `apps/server/src/routers/lambda/admin/middleware.ts` |
| Admin tRPC（users / orders / ledger / pricing / adjustments） | ✅ 已实现 | `apps/server/src/routers/lambda/admin/` |
| 用户定价页 / 积分页 / 账单页 | ✅ 已实现（接真实 tRPC） | `src/business/client/BusinessSettingPages/` |
| 图片 / 视频扣费（chargeBeforeGenerate） | ❌ no-op | Phase 2 |
| 国内支付（支付宝 / 微信支付）Webhook | ❌ 未实现 | Phase 2 |
| Referral / 邀请码系统 | ❌ 空路由 | Phase 2 |
| 手机号短信注册完整链路 | ❌ 未实现 | Phase 2 |
| 对账任务（Stripe diff 检测） | ❌ 未实现 | Phase 2 |

**一键部署成功后文本对话计费即可使用（需配置 Stripe 密钥）。图片/视频扣费等见 Phase 2。** 见 `deploy/ONE_CLICK.md`。

## 5. 相关文档索引

| 文档 | 内容 |
|------|------|
| [REALTIME.md](../architecture/REALTIME.md) | WebSocket / SSE / HTTP 流分工 |
| [CHAT_OPTIMIZATION.md](../architecture/CHAT_OPTIMIZATION.md) | 网页聊天优化 backlog |
| [BYOK.md](./BYOK.md) | 用户自配 API 与计费规则 |
| [ADMIN_UI.md](./ADMIN_UI.md) | 管理后台功能与权限 |
| [ACCEPTANCE_USER_BILLING.md](../qa/ACCEPTANCE_USER_BILLING.md) | 用户与付费验收 |
| [ACCEPTANCE_30MIN.md](../qa/ACCEPTANCE_30MIN.md) | 30 分钟冒烟 |
| [ONE_CLICK.md](../../deploy/ONE_CLICK.md) | Docker 一键部署 |
