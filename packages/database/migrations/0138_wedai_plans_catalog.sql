-- Wedai commercial plans catalog (CNY fen).
-- Idempotent upsert by slug. Credit grants live on plans.token_grant_monthly
-- (used for both monthly and one_time packs via PriceSnapshotService).
-- Does not change checkout / Stripe mode=payment.

-- 1) Upsert plans
INSERT INTO "plans" (
  "id", "slug", "name", "description", "status",
  "token_grant_monthly", "features", "sort_order", "created_at", "updated_at"
) VALUES
  (
    'pln_wedai_free',
    'free',
    '免费版',
    '免费版：每月赠送 100,000 积分（写入 token_grant_monthly，用于体验）。价格 ¥0，无需付款。',
    'active',
    100000,
    '{"maxModels":3,"prioritySupport":false,"tier":"free"}'::jsonb,
    0,
    now(),
    now()
  ),
  (
    'pln_wedai_pack_basic',
    'pack_basic',
    '基础积分包',
    '基础积分包：一次性支付 ¥9.9，到账 9,999 积分。非订阅，付款后立即入账。',
    'active',
    9999,
    '{"pack":true,"tier":"pack_basic"}'::jsonb,
    1,
    now(),
    now()
  ),
  (
    'pln_wedai_pack_standard',
    'pack_standard',
    '标准积分包',
    '标准积分包：一次性支付 ¥29，到账 29,000 积分。非订阅，付款后立即入账。',
    'active',
    29000,
    '{"pack":true,"tier":"pack_standard"}'::jsonb,
    2,
    now(),
    now()
  ),
  (
    'pln_wedai_plus_monthly',
    'plus_monthly',
    'Plus 月付',
    'Plus 月付：¥50 / 月，到账 50,000 积分。当前结账为一次性支付到账（现有 topUp）；Stripe 自动续费尚未开通。',
    'active',
    50000,
    '{"prioritySupport":false,"tier":"plus"}'::jsonb,
    3,
    now(),
    now()
  ),
  (
    'pln_wedai_pro_monthly',
    'pro_monthly',
    'Pro 月付',
    'Pro 月付：¥99 / 月，到账 99,000 积分。当前结账为一次性支付到账（现有 topUp）；Stripe 自动续费尚未开通。',
    'active',
    99000,
    '{"prioritySupport":true,"tier":"pro"}'::jsonb,
    4,
    now(),
    now()
  )
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "status" = 'active',
  "token_grant_monthly" = EXCLUDED."token_grant_monthly",
  "features" = EXCLUDED."features",
  "sort_order" = EXCLUDED."sort_order",
  "updated_at" = now();

-- 2) Archive active prices that no longer match the catalog for these slugs
UPDATE "plan_prices" pp
SET "archived_at" = now()
FROM "plans" p
WHERE pp."plan_id" = p."id"
  AND pp."archived_at" IS NULL
  AND p."slug" IN ('free', 'pack_basic', 'pack_standard', 'plus_monthly', 'pro_monthly')
  AND NOT (
    (p."slug" = 'free' AND pp."billing_interval" = 'monthly' AND pp."amount_minor" = 0 AND pp."currency" = 'CNY')
    OR (p."slug" = 'pack_basic' AND pp."billing_interval" = 'one_time' AND pp."amount_minor" = 990 AND pp."currency" = 'CNY')
    OR (p."slug" = 'pack_standard' AND pp."billing_interval" = 'one_time' AND pp."amount_minor" = 2900 AND pp."currency" = 'CNY')
    OR (p."slug" = 'plus_monthly' AND pp."billing_interval" = 'monthly' AND pp."amount_minor" = 5000 AND pp."currency" = 'CNY')
    OR (p."slug" = 'pro_monthly' AND pp."billing_interval" = 'monthly' AND pp."amount_minor" = 9900 AND pp."currency" = 'CNY')
  );

-- 3) Insert missing active prices (skip if a matching active row already exists)
INSERT INTO "plan_prices" (
  "id", "plan_id", "currency", "amount_minor", "billing_interval", "created_at"
)
SELECT
  'pp_' || replace(gen_random_uuid()::text, '-', ''),
  p."id",
  'CNY',
  v."amount_minor",
  v."billing_interval",
  now()
FROM (
  VALUES
    ('free', 0::bigint, 'monthly'),
    ('pack_basic', 990::bigint, 'one_time'),
    ('pack_standard', 2900::bigint, 'one_time'),
    ('plus_monthly', 5000::bigint, 'monthly'),
    ('pro_monthly', 9900::bigint, 'monthly')
) AS v("slug", "amount_minor", "billing_interval")
JOIN "plans" p ON p."slug" = v."slug"
WHERE NOT EXISTS (
  SELECT 1
  FROM "plan_prices" pp
  WHERE pp."plan_id" = p."id"
    AND pp."archived_at" IS NULL
    AND pp."currency" = 'CNY'
    AND pp."amount_minor" = v."amount_minor"
    AND pp."billing_interval" = v."billing_interval"
);

-- 4) Archive other active plans that are not in this catalog (preserve FK history)
UPDATE "plans"
SET "status" = 'archived', "updated_at" = now()
WHERE "status" = 'active'
  AND "slug" NOT IN ('free', 'pack_basic', 'pack_standard', 'plus_monthly', 'pro_monthly');
