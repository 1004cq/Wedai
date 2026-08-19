# Wedai 支付 Webhook 幂等验收与最小实现方案

> 状态基准：`589f93d`（Phase 1 合入 main，2026-08-19）。
> Stripe Webhook 已实现（`POST /api/webhooks/stripe`，`StripeWebhookService`，`webhook_events` 表），本文件作为不变的验收契约保留。
> 实现路径：`apps/server/src/services/payment/StripeWebhookService.ts`、`src/app/(backend)/api/webhooks/stripe/route.ts`。

## 1. 验收目标

支付平台采用至少一次投递，重复、并发、延迟和乱序是正常情况。Wedai 要保证的不是“Webhook 只收到一次”，而是：

> 对同一合法支付事实，无论收到多少次、以何种并发顺序收到，订单状态变化、余额入账和账本流水都只产生一次业务效果。

验签失败、金额/币种/归属不一致、非法状态转换必须零入账。网络或数据库瞬时失败必须允许 provider 重试，不能为了快速返回 2xx 而丢失事件。

## 2. 建议最小数据模型

名称可在实现时按仓库约定调整，但约束不得弱化。

### 2.1 `payment_webhook_events`

| 字段 | 建议 | 约束/用途 |
| --- | --- | --- |
| `id` | text/nanoid | 主键 |
| `provider` | text | `stripe`、未来 `easypay`/`hupijiao` |
| `event_id` | text | provider 的不可变事件 ID |
| `event_type` | text | 事件类型 |
| `payload_hash` | text | 原始体摘要，用于发现同 ID 不同内容 |
| `status` | enum/text | `received/processing/processed/ignored/failed` |
| `attempt_count` | integer | 每次领取处理递增 |
| `last_error_code` | text/null | 脱敏错误分类，不存 Secret |
| `processing_started_at` | timestamptz/null | 崩溃租约与超时接管 |
| `processed_at` | timestamptz/null | 成功/忽略完成时间 |
| `created_at/updated_at` | timestamptz | 审计 |

必须有唯一索引：

```sql
UNIQUE (provider, event_id)
```

不得默认永久保存完整 payload。若业务确需保留，只存脱敏/加密后的必要字段并设置保留周期。

### 2.2 订单、支付尝试与流水

- `orders`：`order_no` 唯一；`amount_minor BIGINT`；`currency`；`status`；`user_id/account_id`；不可变 `price_snapshot`。
- `payment_attempts`：`(provider, provider_ref)` 唯一；关联内部订单；记录 provider customer、checkout/payment 状态。
- `ledger_entries`：append-only；`business_key` 唯一，例如 `payment:stripe:<event_id>:credit`。
- `wallets`：余额缓存，更新时带行锁/条件更新/版本号；不是审计事实源。

建议唯一约束：

```sql
UNIQUE (provider, provider_ref)
UNIQUE (account_id, business_key)
```

所有金额使用整数最小货币单位；积分使用整数。需要小数时用 PostgreSQL `numeric(p,s)`，服务端使用 decimal 库，禁止 JavaScript `float` 作为权威值。

## 3. 请求处理顺序

### 3.1 路由边界

1. 读取**原始请求体**和 provider 签名头。
2. 使用服务端 endpoint secret 验签并校验时间容差；失败立即返回 400，不能插入订单/流水，也不能相信 body 中的 event ID。
3. 从已验签事件提取 `event_id/type`，计算原始体 `payload_hash`。
4. `INSERT ... ON CONFLICT DO NOTHING` 登记事件；若相同 event ID 已存在但 hash 不同，告警并拒绝。
5. 进入处理事务并 `SELECT ... FOR UPDATE` 锁住事件行。并发重复请求会等待第一个事务结束，而不是提前返回成功。

### 3.2 原子业务事务

同一个数据库事务内完成：

1. 若事件已 `processed/ignored`，直接返回已有结果，不再改变资金。
2. 若 `processing` 且租约未过期，等待锁后重新读取；租约过期才允许接管。
3. 将事件标记 `processing`、递增 attempt。
4. 根据 provider metadata 找内部订单并锁行；禁止只按前端 success URL 或用户传入 ID 定位。
5. 校验订单归属、provider customer、`amount_minor`、currency、可接受 event type 和当前状态。
6. 使用显式状态机执行 `pending → paid | closed | failed`；`paid` 对迟到失败/关闭事件保持终态。
7. 对成功支付插入唯一 `ledger_entries.business_key`，原子更新 wallet；重复唯一键视为已处理，不再次入账。
8. 将事件标记 `processed`（或合法无动作时 `ignored`）并写 `processed_at`。
9. 提交后才向 provider 返回 2xx。

订单、流水、wallet 和事件完成标记必须同事务提交。任何一步失败都回滚资金变化。

### 3.3 失败与重试

- 验签/格式错误：400，不入账；记录不含敏感体的安全日志。
- 合法事件但金额、币种、归属不匹配：不入账，标记 `failed` 或隔离状态并产生高优先级告警；响应策略按 provider 重试语义确定。
- 数据库超时/死锁/暂时不可用：事务回滚，返回 5xx 让 provider 重试。
- 业务事务失败后，用独立的轻量更新记录脱敏错误与 attempt；该记录失败也不能伪装成处理成功。
- 超过重试阈值进入人工对账队列，禁止自动绕过校验直接补余额。

## 4. 乱序与状态机规则

| 当前订单状态 | 收到成功 | 收到关闭 | 收到失败 | 预期 |
| --- | --- | --- | --- | --- |
| `pending` | `paid` + 唯一入账 | `closed` | `failed` | 合法终态转换 |
| `paid` | 保持 `paid`，不重复入账 | 保持 `paid` 并告警/忽略 | 保持 `paid` 并告警/忽略 | 禁止降级 |
| `closed` | 进入人工复核；只有已确认的 provider 最终支付事实才可受控转 `paid` | 保持 | 保持 `closed` | 不静默改资金 |
| `failed` | 按 provider 最终性规则复核；允许时受控转 `paid` | 保持/关闭 | 保持 | 规则必须有测试 |

退款/拒付不应复用“支付成功的负数金额”。应建立独立 event type、独立唯一 business key 和冲正流水，保留原始入账流水。

## 5. 最小 Drizzle 落地顺序

1. 在 `packages/database/src/schemas/` 新增 billing schema，并从 schema index 导出。
2. 生成可重复执行、可回滚评估过的迁移；大表索引按线上锁影响设计。
3. 新建 Repository/Model，封装状态机、事件领取、订单锁、唯一流水和 wallet 原子更新。
4. 在 `packages/billing` 建 provider-neutral 类型、金额单位、状态机和幂等命令；Stripe SDK 仅留在服务端 adapter。
5. 在 `apps/server` 实现支付 Webhook 路由/服务；不要修改 `agent-runtime` 或 `model-runtime` 核心。
6. 加入调试日志/OTEL：仅记录内部 order ID、event ID、状态、attempt、错误分类和耗时，不记录 Secret/完整 payload。
7. 最后接 Stripe Test Mode，并实现定时对账修复“provider 已支付、本地未处理”的差异。

## 6. 必过验收矩阵

| 用例 | 投递方式 | 预期 |
| --- | --- | --- |
| `PAY-005` / `SEC-001` | 错误签名、缺失签名、过期时间戳 | 400；订单/钱包/流水零变化 |
| `PAY-004` | 单次合法成功事件 | `pending → paid`；一条入账流水；余额增加一次 |
| `PAY-006` | 相同 event 串行重复 10 次 | 业务效果一次；其余返回幂等成功 |
| `PAY-009` | 相同 event 并发 20 次 | 最终一次入账，无唯一约束错误泄露给用户 |
| `PAY-007` / `SEC-002` | 已验签但本地金额、币种或订单归属不匹配 | 不入账；告警可检索 |
| `PAY-008` | success 后再投递 closed/failed | 订单仍 paid，不冲掉余额 |
| `PAY-010` | 事务中途故障后重试 | 首次零部分提交；重试后恰好一次成功 |
| `PAY-011` | event ID 相同但 payload hash 不同 | 拒绝并安全告警 |
| `PAY-012` | 未知但合法 event type | 标记 ignored；2xx；零资金变化 |

数据库断言至少包括：

```text
count(webhook_events where provider + event_id) = 1
count(ledger_entries where business_key) = 1
order.status = paid
wallet.after - wallet.before = expected_credit
sum(ledger delta for account) 与 wallet 变化一致
```

## 7. 发布前检查

- [ ] Test 与 Production 使用不同 endpoint secret，且轮换流程已演练。
- [ ] 生产 URL 使用 HTTPS；代理/CDN 不改写验签所需原始请求体。
- [ ] provider 后台只订阅实现过的事件类型。
- [ ] 回调处理延迟、失败率、重复率、账实差异有监控。
- [ ] 事件表和日志有 PII/敏感字段审查与保留策略。
- [ ] 对账任务和人工补账只能创建冲正/补账流水，不能直接 UPDATE 历史 ledger。
- [ ] 回滚应用版本后仍能读取当前 schema 和未处理事件；迁移部署顺序已演练。
