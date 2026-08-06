import type {
  AdjustBalanceInput,
  AdminDashboardMetrics,
  AdminModelPrice,
  AdminOrderRow,
  AdminUserRow,
  AlipayConfig,
  AlipayConfigUpdate,
  AuditListQuery,
  AuditLog,
  OrderListQuery,
  PagedResult,
  SetUserBanInput,
  SmsConfig,
  SmsConfigUpdate,
  SmtpConfig,
  SmtpConfigUpdate,
  UserListQuery,
} from '../types';

const MOCK_DELAY_MS = 80;
const MOCK_ACTOR = 'preview-admin@wedai.local';

const users: AdminUserRow[] = [
  {
    balanceCredits: 24_800,
    email: 'alice@example.com',
    id: 'usr_alice',
    lastActiveAt: '2026-08-03T01:25:00.000Z',
    nickname: 'Alice',
    phone: '138****6801',
    plan: 'pro',
    registeredAt: '2026-07-18T08:10:00.000Z',
    role: 'user',
    status: 'active',
  },
  {
    balanceCredits: 6_200,
    id: 'usr_phone_only',
    lastActiveAt: '2026-08-03T00:42:00.000Z',
    nickname: '手机用户',
    phone: '186****2033',
    plan: 'free',
    registeredAt: '2026-08-02T13:40:00.000Z',
    role: 'user',
    status: 'active',
  },
  {
    balanceCredits: 18_500,
    email: 'ops@example.com',
    id: 'usr_ops',
    lastActiveAt: '2026-08-02T18:30:00.000Z',
    nickname: '运营管理员',
    plan: 'team',
    registeredAt: '2026-06-03T03:00:00.000Z',
    role: 'admin',
    status: 'active',
  },
  {
    balanceCredits: 0,
    email: 'blocked@example.com',
    id: 'usr_blocked',
    lastActiveAt: '2026-07-22T12:00:00.000Z',
    nickname: '已封禁用户',
    plan: 'free',
    registeredAt: '2026-05-11T09:30:00.000Z',
    role: 'user',
    status: 'banned',
  },
];

const orders: AdminOrderRow[] = [
  {
    amountMinor: 9_900,
    createdAt: '2026-08-03T01:05:00.000Z',
    credits: 100_000,
    currency: 'CNY',
    id: 'ord_001',
    orderNo: 'WD202608030001',
    paymentProvider: 'alipay',
    status: 'paid',
    type: 'credit_pack',
    userDisplay: 'alice@example.com',
    userId: 'usr_alice',
  },
  {
    amountMinor: 2_900,
    createdAt: '2026-08-03T00:48:00.000Z',
    credits: 20_000,
    currency: 'CNY',
    id: 'ord_002',
    orderNo: 'WD202608030002',
    paymentProvider: 'stripe',
    status: 'pending',
    type: 'subscription',
    userDisplay: '186****2033',
    userId: 'usr_phone_only',
  },
  {
    amountMinor: 19_900,
    createdAt: '2026-08-02T10:20:00.000Z',
    credits: 240_000,
    currency: 'CNY',
    id: 'ord_003',
    orderNo: 'WD202608020010',
    paymentProvider: 'alipay',
    status: 'closed',
    type: 'subscription',
    userDisplay: 'ops@example.com',
    userId: 'usr_ops',
  },
];

const prices: AdminModelPrice[] = [
  {
    enabled: true,
    id: 'price_gpt_4_1',
    inputCredits: 2,
    mode: 'token',
    model: 'gpt-4.1',
    outputCredits: 8,
    provider: 'openai',
    requestCredits: 0,
    updatedAt: '2026-08-01T06:00:00.000Z',
  },
  {
    enabled: true,
    id: 'price_claude_sonnet',
    inputCredits: 3,
    mode: 'token',
    model: 'claude-sonnet-4',
    outputCredits: 15,
    provider: 'anthropic',
    requestCredits: 0,
    updatedAt: '2026-08-01T06:00:00.000Z',
  },
  {
    enabled: false,
    id: 'price_image_demo',
    inputCredits: 0,
    mode: 'per_request',
    model: 'image-demo',
    outputCredits: 0,
    provider: 'custom',
    requestCredits: 120,
    updatedAt: '2026-07-28T06:00:00.000Z',
  },
];

const audit: AuditLog[] = [
  {
    action: 'billing:payment:config',
    actor: MOCK_ACTOR,
    createdAt: '2026-08-02T11:00:00.000Z',
    id: 'audit_seed_1',
    metadata: { sandbox: true },
    reason: '初始化支付宝沙箱配置',
    targetId: 'alipay',
    targetType: 'config',
  },
];

let alipayConfig: AlipayConfig = {
  alipayPublicKeyConfigured: false,
  appId: '',
  enabled: false,
  notifyUrl: 'https://cq.je/api/webhooks/alipay',
  privateKeyConfigured: false,
  returnUrl: 'https://cq.je/user-center/billing',
  sandbox: true,
  signType: 'RSA2',
};

let smtpConfig: SmtpConfig = {
  enableEmailRegister: true,
  enabled: false,
  fromEmail: '',
  fromName: 'Wedai',
  host: '',
  passwordConfigured: false,
  port: 465,
  provider: 'custom',
  secure: true,
  username: '',
};

let smsConfig: SmsConfig = {
  accessKeyIdConfigured: false,
  accessKeySecretConfigured: false,
  enablePhoneRegister: false,
  enabled: false,
  endpoint: '',
  provider: 'aliyun',
  region: 'cn-hangzhou',
  signName: '',
  templateCode: '',
};

const wait = () => new Promise<void>((resolve) => setTimeout(resolve, MOCK_DELAY_MS));

const paginate = <T>(items: T[], page: number, pageSize: number): PagedResult<T> => ({
  items: items.slice((page - 1) * pageSize, page * pageSize),
  page,
  pageSize,
  total: items.length,
});

const requireReason = (reason: string) => {
  if (!reason.trim()) throw new Error('必须填写操作原因');
};

const pushAudit = (entry: Omit<AuditLog, 'actor' | 'createdAt' | 'id'>) => {
  audit.unshift({
    ...entry,
    actor: MOCK_ACTOR,
    createdAt: new Date().toISOString(),
    id: `audit_${Date.now()}_${audit.length}`,
  });
};

const cloneAudit = (entry: AuditLog): AuditLog => ({
  ...entry,
  metadata: { ...entry.metadata },
});

const isNonEmptySecret = (value: string | undefined): value is string => !!value?.trim();

export const adminMockApi = {
  async adjustBalance(input: AdjustBalanceInput): Promise<AdminUserRow> {
    await wait();
    requireReason(input.reason);
    if (!Number.isSafeInteger(input.deltaCredits) || input.deltaCredits === 0) {
      throw new Error('积分变动必须为非零整数');
    }

    const user = users.find(({ id }) => id === input.userId);
    if (!user) throw new Error('用户不存在');
    if (user.balanceCredits + input.deltaCredits < 0) throw new Error('调整后余额不能小于零');

    const beforeCredits = user.balanceCredits;
    user.balanceCredits += input.deltaCredits;
    pushAudit({
      action: 'billing:balance:adjust',
      metadata: {
        afterCredits: user.balanceCredits,
        beforeCredits,
        deltaCredits: input.deltaCredits,
      },
      reason: input.reason.trim(),
      targetId: user.id,
      targetType: 'user',
    });
    return { ...user };
  },

  async getAlipayConfig(): Promise<AlipayConfig> {
    await wait();
    return { ...alipayConfig };
  },

  async getDashboard(): Promise<AdminDashboardMetrics> {
    await wait();
    return {
      creditsConsumedToday: 18_760,
      creditsGrantedToday: 120_000,
      newUsersToday: 1,
      paidOrdersToday: orders.filter(({ status }) => status === 'paid').length,
      revenueTodayMinor: orders
        .filter(({ status }) => status === 'paid')
        .reduce((total, { amountMinor }) => total + amountMinor, 0),
      totalUsers: users.length,
    };
  },

  async getSmsConfig(): Promise<SmsConfig> {
    await wait();
    return { ...smsConfig };
  },

  async getSmtpConfig(): Promise<SmtpConfig> {
    await wait();
    return { ...smtpConfig };
  },

  async listAudit(query: AuditListQuery): Promise<PagedResult<AuditLog>> {
    await wait();
    const keyword = query.query?.trim().toLowerCase();
    const filtered = keyword
      ? audit.filter((item) =>
          [item.actor, item.action, item.targetId, item.reason].some((value) =>
            value.toLowerCase().includes(keyword),
          ),
        )
      : audit;
    return paginate(filtered.map(cloneAudit), query.page, query.pageSize);
  },

  async listOrders(query: OrderListQuery): Promise<PagedResult<AdminOrderRow>> {
    await wait();
    const filtered = query.status ? orders.filter(({ status }) => status === query.status) : orders;
    return paginate(
      filtered.map((order) => ({ ...order })),
      query.page,
      query.pageSize,
    );
  },

  async listPrices(): Promise<AdminModelPrice[]> {
    await wait();
    return prices.map((price) => ({ ...price }));
  },

  async listUsers(query: UserListQuery): Promise<PagedResult<AdminUserRow>> {
    await wait();
    const keyword = query.query?.trim().toLowerCase();
    const filtered = keyword
      ? users.filter((user) =>
          [user.email, user.phone, user.nickname].some((value) =>
            value?.toLowerCase().includes(keyword),
          ),
        )
      : users;
    return paginate(
      filtered.map((user) => ({ ...user })),
      query.page,
      query.pageSize,
    );
  },

  async setUserBan(input: SetUserBanInput): Promise<AdminUserRow> {
    await wait();
    requireReason(input.reason);
    const user = users.find(({ id }) => id === input.userId);
    if (!user) throw new Error('用户不存在');

    user.status = input.banned ? 'banned' : 'active';
    pushAudit({
      action: input.banned ? 'user:ban' : 'user:unban',
      metadata: { status: user.status },
      reason: input.reason.trim(),
      targetId: user.id,
      targetType: 'user',
    });
    return { ...user };
  },

  async updateAlipayConfig(input: AlipayConfigUpdate): Promise<AlipayConfig> {
    await wait();
    const { alipayPublicKey, privateKey, ...publicConfig } = input;
    alipayConfig = {
      ...publicConfig,
      alipayPublicKeyConfigured:
        alipayConfig.alipayPublicKeyConfigured || isNonEmptySecret(alipayPublicKey),
      privateKeyConfigured: alipayConfig.privateKeyConfigured || isNonEmptySecret(privateKey),
    };
    pushAudit({
      action: 'billing:payment:config',
      metadata: {
        alipayPublicKeyUpdated: isNonEmptySecret(alipayPublicKey),
        enabled: input.enabled,
        privateKeyUpdated: isNonEmptySecret(privateKey),
        sandbox: input.sandbox,
      },
      reason: '更新支付宝支付配置',
      targetId: 'alipay',
      targetType: 'config',
    });
    return { ...alipayConfig };
  },

  async updatePrice(input: AdminModelPrice): Promise<AdminModelPrice> {
    await wait();
    if (
      ![input.inputCredits, input.outputCredits, input.requestCredits].every(
        (value) => Number.isSafeInteger(value) && value >= 0,
      )
    ) {
      throw new Error('模型价格必须为非负整数积分');
    }
    const index = prices.findIndex(({ id }) => id === input.id);
    if (index < 0) throw new Error('价格记录不存在');
    const next = { ...input, updatedAt: new Date().toISOString() };
    prices[index] = next;
    pushAudit({
      action: 'billing:price:write',
      metadata: { enabled: next.enabled, mode: next.mode },
      reason: '更新模型计费价格',
      targetId: next.id,
      targetType: 'price',
    });
    return { ...next };
  },

  async updateSmsConfig(input: SmsConfigUpdate): Promise<SmsConfig> {
    await wait();
    const { accessKeyId, accessKeySecret, ...publicConfig } = input;
    smsConfig = {
      ...publicConfig,
      accessKeyIdConfigured: smsConfig.accessKeyIdConfigured || isNonEmptySecret(accessKeyId),
      accessKeySecretConfigured:
        smsConfig.accessKeySecretConfigured || isNonEmptySecret(accessKeySecret),
    };
    pushAudit({
      action: 'system:sms:config',
      metadata: {
        accessKeyIdUpdated: isNonEmptySecret(accessKeyId),
        accessKeySecretUpdated: isNonEmptySecret(accessKeySecret),
        enablePhoneRegister: input.enablePhoneRegister,
        enabled: input.enabled,
        provider: input.provider,
      },
      reason: '更新短信服务配置',
      targetId: 'sms',
      targetType: 'config',
    });
    return { ...smsConfig };
  },

  async updateSmtpConfig(input: SmtpConfigUpdate): Promise<SmtpConfig> {
    await wait();
    const { password, ...publicConfig } = input;
    smtpConfig = {
      ...publicConfig,
      passwordConfigured: smtpConfig.passwordConfigured || isNonEmptySecret(password),
    };
    pushAudit({
      action: 'system:email:config',
      metadata: {
        enableEmailRegister: input.enableEmailRegister,
        enabled: input.enabled,
        passwordUpdated: isNonEmptySecret(password),
        provider: input.provider,
      },
      reason: '更新 SMTP 配置',
      targetId: 'smtp',
      targetType: 'config',
    });
    return { ...smtpConfig };
  },
};
