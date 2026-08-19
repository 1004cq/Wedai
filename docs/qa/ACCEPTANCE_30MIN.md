# Wedai 30 分钟 P0 本地验收

> 当前代码就绪度：**❌ 阻断，不能完成四项 P0 全量验收。** Better Auth 流程已有实现；Stripe 支付、支付 Webhook、商业订单/余额/流水以及余额不足中间件仍未实现。本清单的第一步是就绪度闸门，闸门失败时必须停止并记录“未实现”，不能用建议路径、空页面或手工改库伪造通过。

本清单只覆盖以下 P0：

1. 注册、登录、登出：`USR-001`、`USR-003`、`USR-005`。
2. Stripe Test Mode 支付成功到账：`PAY-004`。
3. 同一 Webhook 重放不双倍入账：`PAY-006`。
4. 余额不足在模型调用前拦截：`BIL-001`。

完整验收范围与用例字段见 [`ACCEPTANCE_USER_BILLING.md`](./ACCEPTANCE_USER_BILLING.md) 和 [`TEST_CASES.csv`](./TEST_CASES.csv)；Webhook 的目标约束见 [`WEBHOOK_IDEMPOTENCY.md`](./WEBHOOK_IDEMPOTENCY.md)。若三份文档发生冲突，以仓库当前代码和本清单的就绪度闸门为准。

## 1. 仓库真实值

审计基线：2026-08-02，`main`，Git `1ce4d453` 之后的工作区。

| 项目 | 当前真实值 | 结论 |
| --- | --- | --- |
| 全栈开发命令 | 根目录 `bun run dev`（脚本为 `tsx scripts/devStartupSequence.mts`） | Web 验收应使用全栈命令，不能只跑 `dev:next` 或 `dev:spa` |
| 环境解析命令 | `.agents/acceptance/scripts/test-env.sh` | 端口非固定时以它和 dev 终端输出为准 |
| 当前解析 URL | `http://localhost:3010` | 当前无 `.env`，脚本推导 `PORT=3010`、SPA 端口 `9876` |
| 注册 | `http://localhost:3010/signup` | 路由真实存在 |
| 登录 | `http://localhost:3010/signin` | 路由真实存在 |
| 用户资料/用户中心 | `http://localhost:3010/settings/profile` | 真实存在；`/settings` 会重定向到此处 |
| 个人定价 | `http://localhost:3010/settings/plans` | 路由已注册，但 `ENABLE_BUSINESS_FEATURES=false` 且页面组件返回 `null`，当前不可验收 |
| 个人余额 | `http://localhost:3010/settings/credits` | 路由已注册，但页面组件返回 `null`，当前不可验收 |
| 个人账单 | `http://localhost:3010/settings/billing` | 路由已注册，但页面组件返回 `null`，当前不可验收 |
|| Stripe Webhook | **已实现** `POST /api/webhooks/stripe` | `stripe listen --forward-to http://localhost:3010/api/webhooks/stripe` |
|| 订单/余额查询 | **已实现（DB 层）** | 迁移后有商业表（`billing_accounts`/`wallets`/`ledger_entries`/`webhook_events`）；tRPC `topUp.getOrder` 可查订单状态 |
| 余额不足拦截 | **不存在** | 计费插槽为 no-op，不能证明模型调用前已检查余额 |

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

四条都必须输出可执行文件路径。项目使用 `pnpm` 安装依赖、Bun 执行脚本；Docker Desktop 用于本地 PostgreSQL/Redis 等服务；Stripe CLI 只用于 Test Mode。

### 2.2 依赖与环境

```bash
pnpm install --frozen-lockfile
.agents/acceptance/scripts/test-env.sh
```

环境处理分两种，不要覆盖用户已有配置：

- 根目录已有 `.env`：复用它，确认 `APP_URL`、`DATABASE_URL`、`REDIS_URL`、`AUTH_SECRET`、`KEY_VAULTS_SECRET` 都是本地测试值，然后执行 `bun run dev`。
- 根目录没有 `.env`：按仓库验收适配器执行下面的无 `.env` 启动流程。该流程足够验收 Better Auth，但当前不会凭空补出尚未实现的 Stripe/计费配置。

```bash
.agents/acceptance/scripts/init-dev-env.sh setup-db
.agents/acceptance/scripts/init-dev-env.sh seed-user
.agents/acceptance/scripts/init-dev-env.sh dev
```

Stripe 商业实现落地后，Test Mode secret、Webhook secret 和 publishable key 的变量名必须由 `packages/env` 正式定义。真实值只放本地环境或密钥系统，不写入本文件、命令历史、Git 或前端变量。

### 2.3 服务探活

另开终端：

```bash
eval "$(.agents/acceptance/scripts/test-env.sh --exports)"
curl --noproxy '*' -sS -o /dev/null -w '%{http_code}\n' "$SERVER_URL/signin"
```

期望 HTTP `200`。若 dev 终端分配了非标准端口，以终端输出更新 `SERVER_URL` 后重试。

## 3. P0 就绪度闸门

开始计时前依次确认：

| 检查 | 当前结果 | 进入计时的必要条件 |
| --- | --- | --- |
| 注册/登录/登出页面和 Better Auth API | ✅ 代码已存在；本机环境未启动 | `/signup`、`/signin` 可正常渲染，测试数据库可写 |
| 定价/充值入口 | ❌ 空页面且商业开关关闭 | `/settings/plans` 能创建真实 Test Mode checkout，而不是空白页 |
|| Stripe Webhook | **已实现** `POST /api/webhooks/stripe` | `stripe listen --forward-to http://localhost:3010/api/webhooks/stripe` |
| 订单、余额、流水、事件表 | ❌ 不存在 | 迁移后存在真实 schema，且有只读查询或后台页可核账 |
| 余额不足中间件 | ❌ no-op | 模型 provider 调用前执行服务端原子余额检查/预占 |

可用下面的只读命令复核当前阻断，不会打印 Secret：

```bash
rg -n "from ['\"]stripe['\"]|new Stripe|stripe-signature|constructEvent" src apps packages
rg -n "payment_webhook_events|billing_accounts|payment_attempts|ledger_entries|webhook_events" \
  packages/database/src/schemas packages/database/src/models
```

当前基线两条命令都不应找到支付实现。**任一商业闸门仍为 ❌ 时，不开始 30 分钟全量验收；只执行第 4.1 节认证冒烟，其余三项记录为“阻断/未实现”。**

## 4. 30 分钟操作顺序

### 4.1 0–8 分钟：注册、登录、登出

1. 打开 `$SERVER_URL/signup`，用全新的测试邮箱注册。
2. 注册成功后确认进入 onboarding 或已登录主页，并打开 `$SERVER_URL/settings/profile` 核对邮箱/用户资料。
3. 从用户菜单执行“退出登录”。
4. 直接访问 `$SERVER_URL/settings/profile`，确认被要求重新登录或跳转到 `/signin`。
5. 在 `$SERVER_URL/signin` 使用刚注册的凭据重新登录，再次打开 `/settings/profile`。

通过标准：

- 用户只创建一次；注册后身份与资料页一致。
- 登出后旧会话不能访问受保护页面/API。
- 正确凭据能重新登录；错误响应不包含密码、token、堆栈或数据库信息。

当前仓库代码状态：**可测**；本机因缺工具和依赖尚未执行。

### 4.2 8–18 分钟：Stripe Test 支付成功到账

当前仓库状态：**⚠️ 部分实现。** DB 层、webhook handler 和订单 tRPC 已实现（本 PR）；`/settings/plans` UI 仍为空组件，Stripe 配置变量需按 §2.2 设置后方可执行 e2e 测试。

只有在就绪度闸门全部通过后，本节才能执行。执行时必须：

1. 在 `/settings/plans` 创建一笔真实 Stripe Test Mode 订单。
2. 使用 Stripe 官方测试支付方式完成付款。
3. 以 Webhook 处理完成为准核对订单 `pending → paid`、余额增加一次和唯一入账流水。
4. 同时记录内部订单号与 Stripe event ID；success URL 仅作为展示证据。

通过标准：订单、余额、流水和 event 四方一致，金额使用整数最小单位或明确 scale 的 decimal；没有 Webhook 证据不得判通过。

### 4.3 18–23 分钟：Webhook 重放不双倍入账

当前仓库状态：**❌ 阻断/未实现。** 没有支付 event 表、唯一约束或重放入口，不能执行。

实现后，应对 4.2 中同一个已验签 Stripe event 进行 provider 官方重发，并在重发前后使用同一个只读核账入口记录：订单状态、余额、该 event 记录数、该业务键流水数。

通过标准：

- 重发请求得到幂等成功响应。
- 订单仍为 `paid`。
- 余额不再增加。
- `(provider, event_id)` 事件记录数为 1，对应入账 `business_key` 流水数为 1。

禁止用修改 event ID 的新事件代替“同一事件重放”，也禁止手工 UPDATE 数据库制造结果。

### 4.4 23–30 分钟：余额不足拦截

当前仓库状态：**❌ 阻断/未实现。** 当前没有商业 wallet/ledger，也没有可将测试账号设为低余额的后台/fixture；计费 hook 是 no-op。

实现后，应通过正式测试 fixture 或管理后台把测试账号的可用余额设为低于一次模型调用的最小预估费用，再从真实 Web 对话入口发起请求。

通过标准：

- 请求在 provider 调用前被拒绝，并出现充值/降配引导。
- provider 没有收到该请求；仅看 UI 提示不够。
- wallet、usage 和 ledger 没有扣费或遗留预占。
- 重试同一 request ID 不产生重复流水。

## 5. 订单与余额核账方式

当前没有可用的商业后台页面、API 或真实商业表，因此**没有合法的订单/余额只读核账命令**。这是 `PAY-004`、`PAY-006`、`BIL-001` 的发布阻断项。

商业实现合入时必须在本节补入二选一的真实入口，之后才能宣称本清单可全量执行：

1. 默认拒绝、仅管理员可访问的订单/余额/流水查询页；或
2. 仅测试环境可使用的只读脚本/SQL，明确真实表名、字段和 A/B 用户隔离条件。

任何核账查询都只能连接隔离测试库。禁止直接 UPDATE wallet、order、ledger 或 webhook event；测试调账必须走正式业务接口并产生新流水。

## 6. 常见失败排查

| 现象 | 检查与处理 |
| --- | --- |
| `bun: command not found` | 安装团队标准 Bun 版本，重新打开终端后执行 `command -v bun` |
| `docker: command not found` 或 daemon 未运行 | 安装并启动 Docker Desktop；再运行 `init-dev-env.sh setup-db` |
| 缺包、workspace import 失败 | 在仓库根目录执行 `pnpm install --frozen-lockfile`；本清单不涉及独立安装的 desktop/CLI app |
| 端口不是 3010 | 执行 `test-env.sh` 并以 dev 终端输出为最终值；不要硬编码另一个端口 |
| `/signup` 或 `/signin` 白屏 | 查看 dev 终端编译错误和浏览器控制台；不能从 HTTP 200 单独判定页面通过 |
| 登出后仍能看旧内容 | 刷新并调用受保护接口确认；区分缓存画面与服务端会话是否仍有效 |
| `/settings/plans`、`credits`、`billing` 空白 | 当前基线的预期阻断：商业开关为 false 且组件返回 `null`，不是 Stripe 配置错误 |
| Stripe CLI 无 forward-to 路径 | 当前基线没有支付 Webhook；不要借用其他 `/api/webhooks/*` 路由 |
| Stripe 页面成功但余额没变 | success URL 不是入账依据；检查已验签 Webhook、订单状态机和事务日志 |
| 重放后双倍到账 | 检查 `(provider,event_id)`、流水业务键唯一约束及订单/wallet/event 是否同事务 |
| 余额不足请求仍到 provider | 计费检查位置错误或未实现；必须在 provider 调用前原子预占，不能只在响应后扣费 |

## 7. 结果记录

| P0 | 结果 | 必要证据 |
| --- | --- | --- |
| 注册/登录/登出 | 通过 / 失败 / 阻断 | 三个页面状态、用户 ID、登出后的受保护请求结果 |
| Stripe Test 成功到账 | 通过 / 失败 / 阻断 | 订单号、event ID、paid 状态、脱敏余额/流水前后值 |
| Webhook 重放幂等 | 通过 / 失败 / 阻断 | 同一 event 的两次投递结果、事件/流水计数、余额不变 |
| 余额不足拦截 | 通过 / 失败 / 阻断 | provider 未调用证据、用户提示、wallet/usage/ledger 零变化 |

四项全部“通过”才算 30 分钟 P0 验收通过；“未实现”“没有核账入口”“只有 UI 截图”都只能记为阻断。
