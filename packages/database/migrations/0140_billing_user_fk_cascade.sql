-- Allow account / test user teardown to cascade through ownership FKs.
-- Commercial billing originally used ON DELETE RESTRICT on several edges;
-- that blocked UserModel.deleteUser (and shared-DB vitest cleanup) once any
-- billing row existed, because PostgreSQL cascade order across users →
-- billing_accounts vs users → usage_records is unspecified.
--
-- Ownership / child-of-account FKs become CASCADE (or SET NULL for audit refs).
-- Catalog FKs (plans / plan_prices) stay RESTRICT.

ALTER TABLE "usage_records" DROP CONSTRAINT IF EXISTS "usage_records_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "usage_records"
  ADD CONSTRAINT "usage_records_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "usage_records" DROP CONSTRAINT IF EXISTS "usage_records_billing_account_id_fkey";
--> statement-breakpoint
ALTER TABLE "usage_records"
  ADD CONSTRAINT "usage_records_billing_account_id_fkey"
  FOREIGN KEY ("billing_account_id") REFERENCES "billing_accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "usage_records" DROP CONSTRAINT IF EXISTS "usage_records_ledger_entry_id_fkey";
--> statement-breakpoint
ALTER TABLE "usage_records"
  ADD CONSTRAINT "usage_records_ledger_entry_id_fkey"
  FOREIGN KEY ("ledger_entry_id") REFERENCES "ledger_entries"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_billing_account_id_fkey";
--> statement-breakpoint
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_billing_account_id_fkey"
  FOREIGN KEY ("billing_account_id") REFERENCES "billing_accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_attempts" DROP CONSTRAINT IF EXISTS "payment_attempts_order_id_fkey";
--> statement-breakpoint
ALTER TABLE "payment_attempts"
  ADD CONSTRAINT "payment_attempts_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "subscriptions_billing_account_id_fkey";
--> statement-breakpoint
ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_billing_account_id_fkey"
  FOREIGN KEY ("billing_account_id") REFERENCES "billing_accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP CONSTRAINT IF EXISTS "ledger_entries_billing_account_id_fkey";
--> statement-breakpoint
ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_billing_account_id_fkey"
  FOREIGN KEY ("billing_account_id") REFERENCES "billing_accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP CONSTRAINT IF EXISTS "ledger_entries_order_id_fkey";
--> statement-breakpoint
ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP CONSTRAINT IF EXISTS "ledger_entries_operator_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_operator_user_id_fkey"
  FOREIGN KEY ("operator_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "webhook_events" DROP CONSTRAINT IF EXISTS "webhook_events_order_id_fkey";
--> statement-breakpoint
ALTER TABLE "webhook_events"
  ADD CONSTRAINT "webhook_events_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE set null ON UPDATE no action;
