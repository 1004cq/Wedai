# Wedai Phase 1 本地 P0 验收操作手册

> 适用版本：main `589f93d` 及后续。
> 本文对应 `ACCEPTANCE_30MIN.md` 四项 P0，给出从 `pnpm install` 到每项通过的完整命令序列。

## 前置条件

```bash
command -v bun   # >= 1.2
command -v pnpm  # >= 9
command -v docker
command -v stripe  # Stripe CLI
```

---

## 第一步：安装与环境

```bash
git clone https://github.com/1004cq/Wedai.git && cd Wedai
pnpm install --frozen-lockfile
```

创建本地环境文件（**不要复用生产值**）：

```bash
cp .env.example.development .env.development.local
```

在 `.env.development.local` 中填写以下变量（其余保持默认）：

```env
# 必填
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wedai_dev
AUTH_SECRET=一个随机32字符字符串
KEY_VAULTS_SECRET=一个随机base64字符串

# Stripe Test Mode（P0 §2 §3 必须）
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=     # 第三步会填

# 让浏览器能初始化 Stripe.js（Plans 页面的 Checkout 按钮）
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
```

> **获取 Stripe Test Mode 密钥**：登录 [dashboard.stripe.com](https://dashboard.stripe.com) → 右上角切换 Test Mode → Developers → API keys。

---

## 第二步：启动依赖服务与数据库迁移

```bash
# 启动 PostgreSQL / Redis（Docker）
pnpm dev:docker

# 运行所有迁移（含商业表 0132–0136）
pnpm db:migrate

# 验证商业表已创建
psql $DATABASE_URL -c "\dt billing_accounts plans plan_prices orders wallets ledger_entries usage_records webhook_events model_prices"
```

期望输出：9 张商业表全部出现。

---

## 第三步：写入开发用套餐数据（Plans seed）

```bash
pnpm db:seed:dev
```

输出示例：
```
Seeding dev billing data…
  ✓ plans: free, pro_monthly
  ✓ plan_prices: free (¥0), pro_monthly (¥39.00)
  ✓ model_prices: 6 text + 2 image models seeded
Dev billing seed complete.
```

验证：

```bash
psql $DATABASE_URL -c "SELECT slug, name, status FROM plans;"
psql $DATABASE_URL -c "SELECT model_id, provider, is_active, request_credits_flat FROM model_prices;"
```

---

## 第四步：启动 Stripe Webhook 转发

另开一个终端（保持运行）：

```bash
stripe listen --forward-to http://localhost:3010/api/webhooks/stripe --print-secret
```

将打印的 `whsec_xxx` 写入 `.env.development.local`：

```env
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

---

## 第五步：启动开发服务器

```bash
bun run dev
```

等待出现 `Ready on http://localhost:3010`。

探活：

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3010/signin
# 期望 200
```

---

## P0-1（0–8 分钟）：注册 / 登录 / 登出

1. 打开 `http://localhost:3010/signup`，注册新邮箱账号。
2. 注册后进入应用，打开 `http://localhost:3010/settings/profile` 核对邮箱。
3. 点用户菜单 → 退出登录。
4. 访问 `http://localhost:3010/settings/profile`，确认跳转到 `/signin`。
5. 用刚注册的凭据重新登录，进入 `/settings/profile`。

**通过标准**：
- 用户只创建一次
- 登出后受保护页面要求重新登录
- 错误凭据不泄露内部信息

---

## P0-2（8–18 分钟）：Stripe Test 支付成功到账

确保第四步的 `stripe listen` 终端在运行。

1. 打开 `http://localhost:3010/settings/plans`，确认有 Free 和 Pro 两个套餐卡片。
2. 点 Pro 套餐的「Subscribe」，跳转到 Stripe Checkout 页面。
3. 使用测试卡：卡号 `4242 4242 4242 4242`，任意未来日期，任意 CVC，任意账单地址。
4. 完成支付后，在 `stripe listen` 终端观察：
   ```
   --> payment_intent.created [evt_xxx]
   --> checkout.session.completed [evt_yyy]
   <-- [200] POST http://localhost:3010/api/webhooks/stripe
   ```
5. 核账：

```bash
# 记录你的用户 ID（从 settings/profile 页面或数据库查）
USER_ID="your-user-id"

psql $DATABASE_URL -c "
  SELECT o.order_no, o.status, o.paid_at,
         w.available AS wallet_credits
  FROM orders o
  JOIN billing_accounts ba ON ba.id = o.billing_account_id
  JOIN wallets w ON w.billing_account_id = ba.id
  WHERE ba.user_id = '$USER_ID'
  ORDER BY o.created_at DESC LIMIT 1;"
```

**通过标准**：
- `status = 'paid'`
- `wallet_credits > 0`（等于套餐 tokenGrantMonthly = 5000000）
- `stripe listen` 收到 `checkout.session.completed` 并返回 200

---

## P0-3（18–23 分钟）：Webhook 重放不双倍入账

1. 在上一步 `stripe listen` 输出中找到 `checkout.session.completed` 的 event ID（格式 `evt_yyy`）。
2. 重放：
   ```bash
   stripe events resend evt_yyy
   ```
3. 核账：

```bash
EVENT_ID="evt_yyy"

psql $DATABASE_URL -c "
  SELECT count(*) AS event_count
  FROM webhook_events
  WHERE provider = 'stripe' AND event_id = '$EVENT_ID';"

psql $DATABASE_URL -c "
  SELECT count(*) AS ledger_count
  FROM ledger_entries
  WHERE idempotency_key = 'payment:stripe:$EVENT_ID:credit';"

psql $DATABASE_URL -c "
  SELECT available FROM wallets
  WHERE billing_account_id = (
    SELECT id FROM billing_accounts WHERE user_id = '$USER_ID');"
```

**通过标准**：
- `event_count = 1`
- `ledger_count = 1`
- `available` 与 P0-2 结束时相同（没有再增加）

---

## P0-4（23–30 分钟）：余额不足在模型调用前拦截

1. 将测试账号余额清零（**仅本地隔离测试库**）：

```bash
psql $DATABASE_URL -c "
  UPDATE wallets SET available = 0, reserved = 0
  WHERE billing_account_id = (
    SELECT id FROM billing_accounts WHERE user_id = '$USER_ID');"
```

2. 在 `http://localhost:3010` 对话界面选一个**平台模型**（非 BYOK），发送任意消息。

3. 验证：
   - 前端出现「积分不足」或充值引导提示（HTTP 402 响应）
   - `stripe listen` 终端**没有**新的 provider 请求出现
   - 核账：

```bash
psql $DATABASE_URL -c "
  SELECT available, reserved FROM wallets
  WHERE billing_account_id = (
    SELECT id FROM billing_accounts WHERE user_id = '$USER_ID');"
# available = 0, reserved = 0（无遗留预占）
```

4. 充值后重试，确认调用成功并产生扣费流水：

```bash
psql $DATABASE_URL -c "
  SELECT kind, delta, balance_after, created_at
  FROM ledger_entries
  WHERE billing_account_id = (
    SELECT id FROM billing_accounts WHERE user_id = '$USER_ID')
  ORDER BY created_at DESC LIMIT 5;"
```

**通过标准**：
- 余额为 0 时 provider 未被调用，前端有明确提示
- 充值后调用成功，ledger 出现 `hold` + `debit` + `release`（如有多余）条目

---

## 常见问题

| 现象 | 原因 | 处理 |
|------|------|------|
| `/settings/plans` 侧边栏不出现 | `ENABLE_BUSINESS_FEATURES` 未生效 | 确认已拉取最新 main（589f93d+）；重启 dev 服务器 |
| Plans 页面显示「No plans available yet」 | 未运行 seed | 执行 `pnpm db:seed:dev` |
| Stripe Checkout 点击无反应 | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` 未配置 | 填入 `pk_test_xxx` 后重启服务器 |
| Webhook 返回 400 验签失败 | `STRIPE_WEBHOOK_SECRET` 与 `stripe listen --print-secret` 不匹配 | 停止 `stripe listen`，重新运行并复制 `whsec_xxx` |
| 余额不足仍能发消息 | BYOK 模式跳过计费（正常行为） | 在 `设置 → 模型服务商` 中删除该 provider 的 API Key，改用平台模型 |
| `pnpm db:seed:dev` 报唯一约束冲突 | Seed 已运行过 | 正常，使用 `ON CONFLICT DO NOTHING`，冲突不影响结果 |
| Admin tRPC 返回 403 | 用户角色不是 admin | 执行 `psql $DATABASE_URL -c "UPDATE users SET role='admin' WHERE id='$USER_ID';"` |
