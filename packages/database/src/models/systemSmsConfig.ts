import { eq } from 'drizzle-orm';

import {
  SYSTEM_SMS_CONFIG_ID,
  systemSmsConfig,
  type SystemSmsConfigRow,
} from '../schemas/systemSmsConfig';
import type { LobeChatDatabase } from '../type';

export type SystemSmsConfigUpdateInput = {
  accessKeyId?: string | null;
  accessKeySecret?: string | null;
  enablePhoneRegister?: boolean;
  enabled?: boolean;
  mock?: boolean;
  provider?: 'aliyun_pnvs' | 'mock';
  schemeName?: string | null;
  signName?: string | null;
  templateCode?: string | null;
};

export class SystemSmsConfigModel {
  constructor(private readonly db: LobeChatDatabase) {}

  async get(): Promise<SystemSmsConfigRow | null> {
    const [row] = await this.db
      .select()
      .from(systemSmsConfig)
      .where(eq(systemSmsConfig.id, SYSTEM_SMS_CONFIG_ID))
      .limit(1);
    return row ?? null;
  }

  async upsert(input: SystemSmsConfigUpdateInput): Promise<SystemSmsConfigRow> {
    const existing = await this.get();

    if (!existing) {
      const [created] = await this.db
        .insert(systemSmsConfig)
        .values({
          id: SYSTEM_SMS_CONFIG_ID,
          ...input,
        })
        .returning();
      return created!;
    }

    const patch: SystemSmsConfigUpdateInput = { ...input };

    // Empty secret string means "do not overwrite".
    if (patch.accessKeySecret !== undefined && !patch.accessKeySecret?.trim()) {
      delete patch.accessKeySecret;
    }
    if (patch.accessKeyId !== undefined && !patch.accessKeyId?.trim()) {
      delete patch.accessKeyId;
    }

    const [updated] = await this.db
      .update(systemSmsConfig)
      .set(patch)
      .where(eq(systemSmsConfig.id, SYSTEM_SMS_CONFIG_ID))
      .returning();

    return updated!;
  }
}
