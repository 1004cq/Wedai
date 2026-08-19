# Wedai 30 分钟 P0 本地验收

> 状态基准：2026-08-19，commit `589f93d`（Phase 1 合入 main）。
> **P0 全量验收现在可以执行**：认证、Stripe 支付、Webhook 幂等、余额拦截四项均已实现。
> 本清单的第一步是就绪度闸门，闸门失败时必须停止并记录"失败/配置缺失"，不能用手工改库伪造通过。

本清单只覆盖以下 P0：

1. 注册、登录、登出：`USR-001`、`USR-003`、`USR-005`。
2. Stripe Test Mode 支付成功到账：`PAY-004`。
3. 同一 Webhook 重放不双倍入账：`PAY-006`。
4. 余额不足在模型调用前拦截：`BIL-001`。

完整验收范围与用例字段见 [`ACCEPTANCE_USER_BILLING.md`](./ACCEPTANCE_USER_BILLING.md) 和 [`TEST_CASES.csv`](./TEST_CASES.csv)；Webhook 的目标约束见 [`WEBHOOK_IDEMPOTENCY.md`](./WEBHOOK_IDEMPOTENCY.md)。

## 1. 仓库真实值（Phase 1，commit 589f93d）

| 项目 | 当前真实值 | 结论 |
| --- | --- | --- |
| 全栈开发命令 | 根目录 `bun run dev` | Web 验收应使用全栈命令 |
| 环境解析命令 | `.agents/acceptance/scripts/test-env.sh` | 端口非固定时以它和 dev 终端输出为准 |
| 当前解析 URL | `http://localhost:3010` | 默认端口 |
| 注册 | `http://localhost:3010/signup` | ✅ 路由真实存在 |
| 登录 | `http://localhost:3010/signin` | ✅ 路由真实存在 |
| 用户资料 | `http://localhost:3010/settings/profile` | ✅ 真实存在 |
| 个人定价 | `http://localhost:3010/settings/plans` | ✅ 组件已接 `subscription.listPlans` + `topUp.createOrder`，可创建 Stripe Checkout |
| 个人余额 | `http://localhost:3010/settings/credits` | ✅ 组件已接 `spend.balance` + `spend.ledgerHistory` |
| 个人账单 | `http://localhost:3010/settings/billing` | ✅ 组件已接 `spend.usageHistory` |
| Stripe Webhook | ✅ `POST /api/webhooks/stripe` | `src/app/(backend)/api/webhooks/stripe/route.ts` |
| 本地转发命令 | `stripe listen --forward-to http://localhost:3010/api/webhooks/stripe` | 需已配置 `STRIPE_WEBHOOK_SECRET` |
| 订单/余额查询（tRPC） | ✅ 已实现 | `topUp.getOrder`、`spend.balance`、`spend.ledgerHistory` |
| 余额不足拦截 | ✅ 已实现 | `packages/business-server/src/chat-billing/chargeBeforeChat.ts`，`InsufficientBalanceError` → 402 |
| Admin 核账入口 | ✅ 已实现 | tRPC `admin.orders.*`、`admin.ledger.*`（需 `users.role = 'admin'`） |

不要把 `/api/webhooks/casdoor`、`/api/webhooks/logto`、messenger 或视频生成 Webhook 当成 Stripe 支付回调；它们是其他业务。

## 2. 计时前置条件

准备时间不计入 30 分钟。只允许连接本地或隔离测试环境，禁止连接生产数据库或 Stripe Live Mode。

### 2.1 工具

```bash
command -v bun
command -v pnpm
command -v docker
command -v stripe
```

四条都必须输出可执行文件路径。

### 2.2 依赖与环境变量

```bash
pnpm install --frozen-lockfile
```

必须配置以下环境变量（`.env.development.local` 或 Docker 环境）：

```env
# 基础
DATABASE_URL=postgresql://...（隔离测试库）
AUTH_SECRET=随机32位字符串
KEY_VAULTS_SECRET=随机32位 base64

# Stripe Test Mode（PAY-* 验收必须）
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx        # stripe listen --print-secret 获取
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
```

变量名由 `packages/env/src/payment.ts` 正式定义。Secret 类变量不得使用 `NEXT_PUBLIC_` 前缀，不得写入 Git。

### 2.3 运行数据库迁移

```bash
pnpm db:migrate
# 确认以下表存在
psql $DATABASE_URL -c "\dt billing_accounts plans plan_prices orders wallets ledger_entries usage_records webhook_events model_prices"
```

### 2.4 服务探活

```bash
bun run dev
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3010/signin
# 期望 200
```

## 3. P0 就绪度闸门

开始计时前依次确认：

| 检查 | Phase 1 状态 | 进入计时的必要条件 |
| --- | --- | --- |
| 注册/登录/登出页面和 Better Auth API | ✅ 代码已存在 | `/signup`、`/signin` 可正常渲染，测试数据库可写 |
| 定价/充值入口 | ✅ `/settings/plans` 已接 tRPC | 需配置 `STRIPE_SECRET_KEY`，页面能创建 Checkout |
| Stripe Webhook 路由 | ✅ `POST /api/webhooks/stripe` 已实现、已验签 | 需配置 `STRIPE_WEBHOOK_SECRET`，`stripe listen` 能转发 |
| 订单、余额、流水、事件表 | ✅ migration 0132–0134 已实现 | `pnpm db:migrate` 执行后表存在 |
| 余额不足拦截中间件 | ✅ `chargeBeforeChat` 已实现 | 向余额为 0 的账号发对话请求，应返回 402 而非转发 provider |

可用下面的只读命令复核，不会打印 Secret：

```bash
rg -n "constructWebhookEvent\|stripe-signature\|InsufficientBalanceError" src apps packages
rg -n "billing_accounts\|ledger_entries\|webhook_events\|model_prices" \
  packages/database/src/schemas packages/database/src/models
```

**任一闸门未就绪（通常是环境变量缺失而非代码缺失），不开始 30 分钟全量验收。**

## 4. 30 分钟操作顺序

### 4.1 0–8 分钟：注册、登录、登出

1. 打开 `http://localhost:3010/signup`，用全新的测试邮箱注册。
2. 注册成功后打开 `/settings/profile` 核对邮箱/用户资料。
3. 从用户菜单执行"退出登录"。
4. 直接访问 `/settings/profile`，确认被要求重新登录。
5. 在 `/signin` 使用刚注册的凭据重新登录。

通过标准：用户只创建一次；登出后旧会话不能访问受保护 API；错误响应不含密码或堆栈。

当前代码状态：**✅ 可测**。

### 4.2 8–18 分钟：Stripe Test 支付成功到账

当前代码状态：**✅ 可执行**（需 Stripe Test Mode 环境变量）。

操作步骤：

1. 另开终端启动 Stripe 转发：
   ```bash
   stripe listen --forward-to http://localhost:3010/api/webhooks/stripe
   ```
2. 打开 `http://localhost:3010/settings/plans`，选择一个套餐点击「Subscribe」。
3. 跳转 Stripe Checkout，使用测试卡 `4242 4242 4242 4242`（任意未来日期、任意 CVC）完成支付。
4. 观察 `stripe listen` 控制台输出 `✔ checkout.session.completed`。
5. 核账（以 Webhook 完成为准，success URL 不算）：
   ```bash
   # 将 <orderId> 替换为步骤 2 tRPC 返回的订单 ID
   psql $DATABASE_URL -c "
     SELECT o.status, o.paid_at,
            w.available AS wallet_available,
            le.kind, le.delta, le.idempotency_key
     FROM orders o
     JOIN billing_accounts ba ON ba.id = o.billing_account_id
     JOIN wallets w ON w.billing_account_id = ba.id
     JOIN ledger_entries le ON le.order_id = o.id
     WHERE o.id = '<orderId>';"
   ```

通过标准：`status = 'paid'`；`wallet.available` 增加一次（= 价格快照中的 `creditGrant`）；`ledger_entries` 恰好一行 `kind = 'credit'`；`(provider, event_id)` 事件记录数为 1。

### 4.3 18–23 分钟：Webhook 重放不双倍入账

当前代码状态：**✅ 可执行**（需已完成 4.2）。

操作步骤：

1. 记录 4.2 中 `stripe listen` 打印的 Stripe event ID（格式 `evt_xxx`）。
2. 重发同一事件：
   ```bash
   stripe events resend evt_xxx
   ```
3. 核账：
   ```bash
   psql $DATABASE_URL -c "
     SELECT count(*) AS event_count
     FROM webhook_events WHERE provider = 'stripe' AND event_id = 'evt_xxx';

     SELECT count(*) AS ledger_count
     FROM ledger_entries WHERE idempotency_key = 'payment:stripe:evt_xxx:credit';"
   ```

通过标准：`event_count = 1`；`ledger_count = 1`；`wallet.available` 与 4.2 结束后相同，不再增加；重发响应 HTTP 200，`outcome = 'idempotent'`。

### 4.4 23–30 分钟：余额不足拦截

当前代码状态：**✅ 可执行**。

操作步骤：

1. 用 Admin tRPC 或直接 SQL 将测试账号余额归零（测试环境专用）：
   ```bash
   # 方式 A：Admin tRPC（推荐，产生审计流水）
   # 调用 admin.adjustments.debit，credits = 当前全部余额，附 reason 和 idempotencyKey

   # 方式 B：仅限本地隔离测试库的直接 SQL（不产生流水，只用于快速置零验收）
   psql $DATABASE_URL -c "UPDATE wallets SET available = 0 WHERE billing_account_id = (
     SELECT id FROM billing_accounts WHERE user_id = '<testUserId>');"
   ```
2. 在 Web 对话界面向平台模型发起一条对话请求。
3. 验证：
   - 响应应为 402 / 前端出现"积分不足"提示。
   - 查看 `stripe listen` 控制台：**不应有**新的 provider 调用。
   - 核账：
     ```bash
     psql $DATABASE_URL -c "
       SELECT available, reserved FROM wallets
       WHERE billing_account_id = (
         SELECT id FROM billing_accounts WHERE user_id = '<testUserId>');"
     # available 仍为 0，reserved 仍为 0（无遗留预占）
     ```

通过标准：provider 未收到请求；wallet 无变化；重试同一 `X-Request-Id` 不产生重复流水；用户收到可操作的充值引导。

## 5. 订单与余额核账方式

Phase 1 已提供以下核账入口：

**tRPC（需登录或 Admin 角色）：**
- `topUp.getOrder({ orderId })` — 单笔订单状态
- `spend.balance` — 当前用户余额
- `spend.ledgerHistory` — 分页流水
- `admin.orders.get({ orderId })` — 管理员查订单 + payment attempts + 事件（需 `role = 'admin'`）
- `admin.ledger.list({ billingAccountId })` — 管理员查账本

**只读 SQL（仅隔离测试库）：**
```sql
-- 订单核账
SELECT o.id, o.order_no, o.status, o.amount_minor, o.currency, o.paid_at
FROM orders o WHERE o.id = '<orderId>';

-- 流水核账
SELECT kind, delta, balance_after, idempotency_key, created_at
FROM ledger_entries WHERE billing_account_id = '<bacId>'
ORDER BY created_at DESC LIMIT 20;

-- Webhook 核账
SELECT provider, event_id, status, attempt_count, processed_at
FROM webhook_events WHERE order_id = '<orderId>';
```

禁止直接 `UPDATE wallet / order / ledger`；测试调账必须走 `admin.adjustments.*` 并产生新流水。

## 6. 常见失败排查

| 现象 | 检查与处理 |
| --- | --- |
| `bun: command not found` | 安装团队标准 Bun 版本 |
| `docker: command not found` 或 daemon 未运行 | 安装并启动 Docker Desktop |
| 缺包、workspace import 失败 | 根目录执行 `pnpm install --frozen-lockfile` |
| `/signup` 或 `/signin` 白屏 | 查看 dev 终端编译错误和浏览器控制台 |
| `/settings/plans` 空白或无法 Checkout | 检查 `STRIPE_SECRET_KEY` 和 `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` 是否配置 |
| Stripe CLI 转发无反应 | 确认 `STRIPE_WEBHOOK_SECRET` = `stripe listen --print-secret` 的输出值 |
| Stripe 页面成功但余额没变 | success URL 不是入账依据；检查 `stripe listen` 是否收到 `checkout.session.completed` 事件并返回 200 |
| 重放后双倍到账 | 检查 `(provider, event_id)` 唯一索引是否在 DB 生效（`pnpm db:migrate` 执行过？） |
| 余额不足请求仍到达 provider | 确认 `chargeBeforeChat` 在 `modelRuntime.chat()` 之前调用；检查是否为 BYOK 请求（BYOK 不扣费） |
| Admin tRPC 返回 403 | 确认调用方的 `users.role = 'admin'`（在数据库里手动设置或通过 Better Auth admin 插件） |
| 迁移后表不存在 | 确认 `DATABASE_URL` 指向正确的测试库，然后 `pnpm db:migrate` |

## 7. 结果记录

| P0 | 结果 | 必要证据 |
| --- | --- | --- |
| 注册/登录/登出 | 通过 / 失败 / 阻断 | 三个页面状态、用户 ID、登出后的受保护请求结果 |
| Stripe Test 成功到账 | 通过 / 失败 / 阻断 | 订单号、event ID、`paid` 状态、脱敏余额/流水前后值、`stripe listen` 截图 |
| Webhook 重放幂等 | 通过 / 失败 / 阻断 | 同一 event 的两次投递结果、事件/流水计数、余额不变 |
| 余额不足拦截 | 通过 / 失败 / 阻断 | provider 未调用证据（`stripe listen` 无新事件）、用户提示、wallet/usage/ledger 零变化 |

四项全部"通过"才算 30 分钟 P0 验收通过；"配置缺失""只有 UI 截图""没有 Webhook 证据"都只能记为阻断。
