# Wedai 用户与付费功能验收总清单

> 审计基线：2026-08-02，Git `a551d9f9`（`main`）。本清单面向 Wedai Web/服务端；LobeHub 上游通用能力与 Wedai 商业化能力分开判定。

## 1. 目标与范围

本验收覆盖用户身份、套餐与余额、订单与支付、模型调用计费、管理后台、安全边界和可审计性。30 分钟 P0 冒烟以 [`ACCEPTANCE_30MIN.md`](./ACCEPTANCE_30MIN.md) 为准；详细用例见 [`TEST_CASES.csv`](./TEST_CASES.csv)，支付回调的实现与验收契约见 [`WEBHOOK_IDEMPOTENCY.md`](./WEBHOOK_IDEMPOTENCY.md)。

验收状态定义：

- **已可测**：仓库已有真实实现，可在环境就绪后执行。
- **条件可测**：已有实现，但依赖 SSO、邮件、数据库等外部配置。
- **未实现**：只有空页面、空路由、no-op 插槽或设计文档；必须先完成前置开发。
- **有风险**：存在可复用基础，但当前实现不能作为商业安全或资金一致性保证。

## 2. 当前代码审计

| 能力 | 状态 | 代码证据 | 验收判断 |
| --- | --- | --- | --- |
| 邮箱注册、登录、登出、找回密码 | 已可测 | `src/features/Auth/**`、`src/store/user/slices/auth/action.ts`、`src/app/(backend)/api/auth/[...all]/route.ts` | Better Auth 主流程和前端单测已存在，仍需真实数据库端到端验证 |
| 邮箱验证、Magic Link、SSO/OIDC | 条件可测 | `src/libs/better-auth/define-config.ts`、`src/libs/better-auth/sso/**`、`packages/env/src/auth.ts` | 按环境变量开启；未配置时不得把用例失败算产品缺陷 |
| 资料与账号安全 | 已可测 | `src/routes/(main)/settings/profile/**`、`src/routes/(main)/settings/security/index.tsx` | 姓名、头像、邮箱、密码/安全页可测 |
| 登录态 API 防护 | 已可测 | `packages/trpc/src/middleware/userAuth.ts`、`packages/trpc/src/lambda/index.ts` | `authedProcedure` 无用户时返回 `UNAUTHORIZED` |
| 通用业务数据隔离 | 已可测但需回归 | `apps/server/src/routers/lambda/user.ts`、大量 `packages/database/src/models/__tests__/**` 用户隔离用例 | 上游模型普遍以 `ctx.userId` 构造；商业表仍需独立隔离测试 |
| Better Auth 管理角色底座 | 有风险 | `src/libs/better-auth/define-config.ts` 的 `admin()`、`packages/database/src/schemas/user.ts` 的 `role/banned` | 仅是身份底座，不等于 Wedai 商业后台已完成 |
| 套餐、余额、定价、充值 UI | **已实现** | `src/business/client/BusinessSettingPages/{Plans,Credits,Billing}.tsx` 接真实 tRPC；Checkout 轮询 | 需 `ENABLE_BUSINESS_FEATURES=true`（已默认开启）|
| 订单、支付、Stripe Webhook | **已实现** | topUp/spend/subscription tRPC；`POST /api/webhooks/stripe`；idempotent | 需配置 `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` |
| 对话/生成计费 | **已实现** | `packages/business-server/src/chat-billing/`（文本）；`{image,video}-generation/charge*`（生图/视频）| Agent 多步仍未计费 |
| 商业数据库表 | **已实现** | `packages/database/src/schemas/billing.ts`，migrations 0132–0136 | `pnpm db:migrate` 后创建 |
| 推荐邀请码 | 未实现 | `packages/business-server/src/lambda-routers/referral.ts` 为空，Referral 页面返回 `null` | Workspace 邮件邀请已存在，但不是商业邀请码/返利系统 |
| 商业管理后台 | 未实现/高风险 | `src/features/admin/README.md` 为占位；商业路由无用户/订单/流水管理 API | `packages/business-server` 的 OSS RBAC middleware 是放行 stub，禁止直接作为商业后台安全边界 |

### 2.1 上线阻断差距

1. 缺少 Phase 1 商业表、迁移、Repository/Model 与并发测试。
2. 缺少服务端定价快照、余额预占/结算/释放和不可变流水。
3. 缺少订单状态机、Stripe Test Mode 下单、验签 Webhook、幂等与对账。
4. 缺少套餐/余额/订单用户页，以及用户、订单、流水、调账、审计管理页。
5. 缺少独立、默认拒绝的商业管理员中间件；不能使用 OSS 的 no-op workspace RBAC stub。
6. 缺少支付与计费可观测性：请求 ID、订单号、provider event ID、处理状态和失败重试指标。

## 3. 验收环境准备

### 3.1 环境与数据

- 使用独立 PostgreSQL 测试库，严禁连接生产库；迁移前后各保留一次可恢复快照。
- Redis 使用独立测试实例，避免会话或异步任务串到其他环境。
- Stripe 使用 **Test Mode**，Webhook 指向本地隧道或测试环境；只使用测试支付方式。
- 准备普通用户 A、普通用户 B、管理员 M。三者使用不同邮箱；A/B 各自有独立订单、会话、流水。
- 为 A 准备余额充足、余额不足、恰好等于预估费用三种账户；为 B 准备至少一笔不可被 A 访问的订单。
- 固定一个模型价格版本 `price-v1`，验收中途发布 `price-v2`，用于验证价格快照。
- 所有测试订单、流水、回调事件带统一批次标签，测试后按批次清理；流水本身若为审计记录，应使用冲正而非物理删除。

### 3.2 环境变量清单

以下仅列变量名和用途，不填写任何真实密钥。

| 类别 | 变量 | 当前状态/说明 |
| --- | --- | --- |
| 应用 | `APP_URL` | 已存在；本地通常指向 `http://localhost:3010` |
| 数据库 | `DATABASE_URL` | 已存在；必须指向隔离测试库 |
| 加密 | `KEY_VAULTS_SECRET` | 已存在；使用测试值，禁止复用生产值 |
| 认证 | `AUTH_SECRET` | 已存在；Better Auth 服务端秘密，不得暴露到浏览器 |
| 认证 | `AUTH_TRUSTED_ORIGINS` | 已存在；包含本地/测试域名 |
| 认证 | `AUTH_EMAIL_VERIFICATION`、`AUTH_ENABLE_MAGIC_LINK` | 已存在；按待测场景开关 |
| SSO | `AUTH_SSO_PROVIDERS` 与对应 `AUTH_*_ID/SECRET/ISSUER` | 已存在；仅在执行 SSO 用例时配置 |
| 邮件 | `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` 或 `RESEND_API_KEY/RESEND_FROM` | 已存在；使用测试邮箱通道 |
| Redis | `REDIS_URL` | 已存在；隔离测试实例 |
| Stripe | `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET` | **待实现变量契约**；仅服务端，使用 Test Mode |
| Stripe | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | **待实现变量契约**；只允许 publishable key 进入前端 |
| Stripe | `STRIPE_PRICE_*` 或服务端价格表配置 | **待实现变量契约**；不得相信前端传入金额 |
| 可选支付 | `EASYPAY_*`、`HUPIJIAO_*` | **待实现变量契约**；MVP 可不配置 |

商业变量加入代码时必须同步加入 `packages/env` 的服务端校验；Secret 类变量不得使用 `NEXT_PUBLIC_` 前缀。

## 4. 用户功能验收

### 4.1 注册、登录与会话

- [ ] 邮箱注册成功，重复邮箱被拒绝，密码策略生效。
- [ ] 开启邮箱验证时，未验证账号受限；验证链接成功后可登录。
- [ ] 正确密码登录成功，错误密码不泄露账号存在性或内部错误。
- [ ] 登出后会话失效，旧页面刷新和受保护 tRPC 请求均要求重新登录。
- [ ] 找回密码成功；重置后旧会话按配置撤销。
- [ ] 开启 SSO 时，成功、拒绝授权、state/nonce 异常和账号绑定均有明确结果。

### 4.2 资料、角色与隔离

- [ ] 用户可查看和更新自己的姓名、头像、邮箱及安全设置。
- [ ] 用户中心显示的套餐、可用余额、冻结/预占余额来自服务端权威值；当前为**未实现**。
- [ ] 普通用户访问 `/admin` 及全部 admin API 返回 403/隐藏资源，而不是仅依赖前端菜单隐藏；当前为**未实现**。
- [ ] A 无法通过替换 user ID、order ID、游标或 workspace 参数读取/修改 B 的资料、订单、余额和流水。
- [ ] 商业表的所有 Repository/Model 测试都至少覆盖 A/B 隔离。
- [ ] 推荐邀请码仅在功能实际启用后验收；当前 referral 空路由/空页面，标记为**未实现**。Workspace 邮件邀请应作为独立协作功能测试，不得冒充商业邀请码。

## 5. 付费功能验收

### 5.1 定价与下单

- [ ] 定价页由服务端返回可售计划、币种、整数最小货币单位金额和价格版本。
- [ ] 创建订单时客户端只提交 `plan/price id`；服务端重新读取价格，忽略或拒绝客户端金额。
- [ ] 下单生成全局唯一内部订单号，初始状态为 `pending`，并记录用户、币种、`amount_minor`、价格快照。
- [ ] 用户取消支付后订单不入账，可进入 `closed`；重复取消不产生副作用。

### 5.2 Stripe Test Mode 与状态机

- [ ] Stripe Test Mode 成功支付后，由已验签 Webhook 驱动订单 `pending → paid` 和余额到账。
- [ ] 前端 success URL 只能展示“处理中/结果”，不得直接将订单改成 `paid` 或给余额。
- [ ] 错误签名、缺失签名、过期签名全部拒绝，订单和余额不变。
- [ ] 同一 Stripe event 重复投递任意次数，只产生一次订单状态变化和一次入账流水。
- [ ] 回调中的金额、币种、内部订单号、customer 与本地订单不一致时拒绝入账并告警。
- [ ] 状态机只允许 `pending → paid | closed | failed`；`paid` 不得被迟到的失败/关闭事件降级。
- [ ] 短暂数据库错误返回可重试状态；重试后最终只入账一次。

## 6. 计费扣费验收

### 6.1 金额与事务原则

- 货币使用整数最小单位，例如 `amount_minor BIGINT`；积分/余额使用整数单位。若必须支持小数，使用 PostgreSQL `numeric/decimal` 并明确 scale，禁止 JavaScript `float` 参与权威金额计算。
- 钱包只作为快速余额视图，账本流水为审计事实；所有余额变化必须对应不可变流水。
- 推荐使用“**预占 → 成功结算/失败释放**”，而不是先扣款后尽力退款。预占、结算、释放都必须在数据库事务内执行。
- 每次模型请求在调用前固化 `price_snapshot_id`、模型、provider、计费单位和请求幂等键；价格更新只影响之后新建的请求。

### 6.2 核心场景

- [ ] 余额不足时在模型调用前拦截，模型 provider 未收到请求，并返回可操作的充值/降配引导。
- [ ] 余额充足时先原子预占；成功返回后按实际 usage 结算，释放多余预占，写 usage 与 ledger。
- [ ] provider 超时、网络错误、显式失败或流式中断按规则释放/冲正，不出现“无服务但净扣费”。
- [ ] 同一 `request_id` 重试不重复预占或扣费。
- [ ] A 同时发起多笔请求时使用事务行锁、原子条件更新或版本号，最终余额不为负且不超扣。
- [ ] 余额恰好等于预估费用时行为确定且有边界测试。
- [ ] usage 缺失或 provider 报告异常时走明确的保守策略并告警，不允许静默产生不可对账费用。
- [ ] 结算失败不得改变已经交付的模型结果状态；进入可重试对账队列并产生告警。

## 7. 管理后台验收

- [ ] 用户、订单、流水列表支持服务端分页、稳定排序与搜索，空结果和错误态明确。
- [ ] 普通用户、未登录用户调用任意管理 API 均分别返回 403、401。
- [ ] 管理员只能通过服务端角色/权限判断进入；禁止把 `admin` query/body 字段当授权依据。
- [ ] 手动加/减余额必须填写原因，生成唯一幂等键、不可变流水和操作审计；禁止直接改钱包数值。
- [ ] 重复提交调账请求只生效一次；余额不足的人工扣减按业务规则拒绝或走审批。
- [ ] 管理员可按订单号、provider ref、event ID 定位支付链路，查看脱敏处理状态和重试历史。
- [ ] 所有管理读取同样执行字段脱敏，不展示支付 Secret、完整卡数据或未脱敏 Webhook payload。

## 8. 安全验收

- [ ] 使用伪造签名、旧时间戳、错误 endpoint secret 调用支付 Webhook，必须拒绝且不入账。
- [ ] 篡改 plan、金额、币种、用户 ID、订单 ID、provider ref 均不能改变权威订单。
- [ ] A 访问 B 的订单、流水、余额及管理接口返回 404/403，响应不泄露 B 是否存在。
- [ ] Webhook 验签必须使用原始请求体；验签前不得信任 JSON 字段或写资金数据。
- [ ] 服务端日志和错误响应不含 Stripe Secret、Webhook Secret、Authorization、完整支付 payload、邮箱等不必要 PII。
- [ ] 构建产物中只允许 Stripe publishable key；`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET` 和数据库凭据不得出现。
- [ ] 回调重放、并发回调、乱序回调与超时重试均满足同一业务效果只发生一次。
- [ ] 商业管理员鉴权使用默认拒绝的独立中间件；不得直接使用当前 OSS 放行 stub。

## 9. MVP 试运行通过标准

以下 **12 条必须全部满足**，少一条都不能进入第一期真实资金试运行：

1. 注册、登录、登出和受保护 API 会话失效通过。
2. 普通用户无法访问任何商业 admin 页面/API。
3. A/B 用户的订单、余额、流水和 usage 数据隔离通过。
4. 定价与下单金额完全由服务端决定，使用整数最小单位或明确 scale 的 decimal。
5. Stripe Test Mode 成功支付能由已验签 Webhook 完成一次且仅一次到账。
6. 错误签名、篡改金额/币种/订单归属均不入账并有可检索告警。
7. 订单状态机 `pending → paid | closed | failed` 的合法/非法转换通过。
8. 余额不足在模型调用前被拦截，provider 未被调用。
9. 成功模型调用产生 price snapshot、usage 和唯一扣费流水，账实一致。
10. 模型调用失败/中断能释放预占或冲正，净扣费为零。
11. 并发与重复请求测试后余额不为负、不超扣、无重复流水。
12. 管理员手工调账产生不可变流水、操作日志和幂等结果，Secret 不进入前端包或日志。

## 10. 验收证据与退出条件

每轮验收至少保存：应用 commit、迁移版本、测试环境标识、用例结果、关键请求 ID、订单号、provider event ID、脱敏数据库查询结果、页面截图和失败日志。P0 必须 100% 通过，P1 无未评估的资金/权限缺陷；任何会导致重复入账、越权、负余额、无服务净扣费或 Secret 泄漏的问题均为上线阻断。

## 11. 建议自动化分层

- **数据库/Repository**：唯一约束、状态机、事务回滚、并发预占、幂等 ledger、A/B 隔离。
- **tRPC/API**：401/403、金额重算、订单归属、重复 request id、管理员权限。
- **Webhook 集成**：原始体验签、重复/并发/乱序事件、瞬时失败重试、金额币种校验。
- **Web E2E**：注册登录、定价下单、取消、支付后刷新、余额/流水展示、管理员检索和调账。
- **对账任务**：故意制造本地/Stripe 状态差异，验证可检测、可重试、可审计。

## 12. 建议手工验收顺序

### 12.1 30 分钟冒烟版

执行入口见 [`ACCEPTANCE_30MIN.md`](./ACCEPTANCE_30MIN.md)。该清单只保留四项 P0：注册/登录/登出、Stripe Test 成功到账、Webhook 重放不双倍入账、余额不足拦截，并以真实路由和实现就绪度作为开始计时前的闸门。当前代码只能执行认证部分，其他三项必须记录为“阻断/未实现”。

### 12.2 2 小时完整版

1. **0–15 分钟**：环境、迁移、A/B/M fixture、邮件/SSO/Stripe Test 连通性。
2. **15–35 分钟**：注册、重复注册、登录失败、邮箱验证、找回密码、SSO、资料、安全页和会话失效。
3. **35–55 分钟**：A/B 资料、订单、余额、流水、usage 隔离；未登录/普通用户 admin 越权。
4. **55–80 分钟**：定价、下单、取消、成功支付、success URL 防伪、金额/币种/归属篡改和完整状态机。
5. **80–95 分钟**：Webhook 串行重复、并发重复、乱序、同 ID 异 payload、未知事件和故障重试。
6. **95–110 分钟**：余额不足、成功结算、provider 失败、流式中断、临界余额、重复 request id、价格版本切换。
7. **110–117 分钟**：后台分页/搜索、调账幂等、操作审计、敏感字段脱敏。
8. **117–120 分钟**：账实查询、日志/前端 Secret 抽查、记录阻断问题与验收证据。

## 13. 本地运行与点测

### 13.1 启动基础环境

```bash
pnpm install --frozen-lockfile
cp .env.example.development .env.development.local
# 仅填写本地测试值，不复制生产 Secret
pnpm dev:docker
pnpm db:migrate
bun run dev
```

打开 `http://localhost:3010`。如果本机未安装 Bun，可先按团队标准安装；不要用不同 lockfile 的安装方式改写依赖锁。

### 13.2 先跑现有认证回归

```bash
bunx vitest run \
  src/features/Auth/SignIn/useSignIn.test.ts \
  src/features/Auth/SignUp/useSignUp.test.ts \
  src/libs/better-auth/define-config.test.ts \
  'src/app/(backend)/api/auth/[...all]/route.test.ts' \
  packages/trpc/src/middleware/userAuth.test.ts
```

需要浏览器回归时，在环境和 fixture 就绪后运行：

```bash
pnpm test:e2e:smoke
```

### 13.3 商业功能实现后的 Stripe 点测

当前仓库没有 Stripe 支付 Webhook 路由，因此不存在可执行的 `stripe listen --forward-to` 命令。不得把曾经建议的 `/api/webhooks/stripe` 当作真实接口，也不得借用 Casdoor、Logto、messenger 或视频 Webhook。商业实现落地后，先把真实 handler 路径和真实只读核账入口写入 [`ACCEPTANCE_30MIN.md`](./ACCEPTANCE_30MIN.md)，再开始 Stripe Test Mode 点测。

### 13.4 每次提交前

```bash
bun run check docs/qa/ACCEPTANCE_USER_BILLING.md docs/qa/WEBHOOK_IDEMPOTENCY.md
git diff --check
```

CSV 应额外校验列数、编号唯一性和 P0 数量；任何测试输出、截图或日志都必须先脱敏。
