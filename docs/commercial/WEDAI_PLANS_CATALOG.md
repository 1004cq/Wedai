# Wedai Plans Catalog

金额单位：**分（fen）**。积分到账字段复用 `plans.token_grant_monthly`（`PriceSnapshotService` → order `creditGrant`）。\
Checkout 仍为现有 **topUp + Stripe `mode=payment`**；`monthly` 仅为展示 / 元数据，**未接 Stripe 自动续费**。

## Catalog

| slug            | 展示名     | interval  | amount\_minor | creditGrant (`token_grant_monthly`) | 说明                       |
| --------------- | ---------- | --------- | ------------- | ----------------------------------- | -------------------------- |
| `free`          | 免费版     | monthly   | 0             | 100000                              | 每月赠送 10 万积分体验；¥0 |
| `pack_basic`    | 基础积分包 | one\_time | 990 (¥9.9)    | 9999                                | 一次性到账                 |
| `pack_standard` | 标准积分包 | one\_time | 2900 (¥29)    | 29000                               | 一次性到账                 |
| `plus_monthly`  | Plus 月付  | monthly   | 5000 (¥50)    | 50000                               | 现结账一次性到账           |
| `pro_monthly`   | Pro 月付   | monthly   | 9900 (¥99)    | 99000                               | 现结账一次性到账           |

Schema 已支持 `billing_interval = one_time`，积分包走同一 topUp 流程，**不破坏现有 checkout**。

## 如何写入

### 生产 / 已部署库（推荐）

应用启动会跑 Drizzle journal。迁移：

- `packages/database/migrations/0138_wedai_plans_catalog.sql`

幂等：按 `slug` upsert plans；归档不匹配的 active `plan_prices`；插入缺失价格；归档目录外 active plans。

### 本地 / 手工重跑

```bash
DATABASE_URL=postgresql://... pnpm --filter @lobechat/database seed:dev-billing
```

源码：

- `packages/database/src/seed/wedai-plan-catalog.ts` — 目录常量
- `packages/database/src/seed/dev-billing.ts` — upsert + model\_prices 默认非 0

### Admin

当前 **没有** plans CRUD（`admin.pricing.*` 仅 `model_prices`）。改价请改 catalog + 重跑 seed / 迁移逻辑，或直接 SQL；不要改已有被订单引用的 `plan_prices` 行金额（应归档后新建行）。

## model\_prices

seed / 既有默认：文本模型 prompt 1 /completion 2 credits per 1k tokens（非 0）；图片类 flat 100。Admin 可继续覆盖。
