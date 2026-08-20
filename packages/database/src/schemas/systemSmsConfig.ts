/**
 * Singleton SMS verification config (Aliyun PNVS / mock).
 * Admin can update via tRPC; env vars fill gaps when DB row is absent or fields empty.
 */
import { boolean, pgTable, text } from 'drizzle-orm/pg-core';

import { updatedAt } from './_helpers';

export const SYSTEM_SMS_CONFIG_ID = 'default';

export const systemSmsConfig = pgTable('system_sms_config', {
  id: text('id').primaryKey().notNull().default(SYSTEM_SMS_CONFIG_ID),
  enabled: boolean('enabled').notNull().default(false),
  /** aliyun_pnvs | mock */
  provider: text('provider').notNull().default('mock'),
  accessKeyId: text('access_key_id'),
  accessKeySecret: text('access_key_secret'),
  signName: text('sign_name'),
  templateCode: text('template_code'),
  schemeName: text('scheme_name'),
  mock: boolean('mock').notNull().default(false),
  enablePhoneRegister: boolean('enable_phone_register').notNull().default(true),
  updatedAt: updatedAt(),
});

export type SystemSmsConfigRow = typeof systemSmsConfig.$inferSelect;
export type NewSystemSmsConfigRow = typeof systemSmsConfig.$inferInsert;
