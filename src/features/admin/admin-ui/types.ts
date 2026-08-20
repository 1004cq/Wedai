export type AdminRole = 'admin' | 'super_admin' | 'user';

export type AdminPermission =
  | 'admin:audit:read'
  | 'admin:dashboard:read'
  | 'billing:balance:adjust'
  | 'billing:order:read'
  | 'billing:order:refund'
  | 'billing:payment:config'
  | 'billing:price:read'
  | 'billing:price:write'
  | 'billing:webhook:read'
  | 'role:assign'
  | 'system:email:config'
  | 'system:sms:config'
  | 'user:ban'
  | 'user:read'
  | 'user:update';

export type AdminUserStatus = 'active' | 'banned';

export interface AdminUserRow {
  balanceCredits: number;
  email?: string;
  id: string;
  lastActiveAt: string;
  nickname: string;
  phone?: string;
  plan: 'free' | 'pro' | 'team';
  registeredAt: string;
  role: AdminRole;
  status: AdminUserStatus;
}

export interface AdminDashboardMetrics {
  creditsConsumedToday: number;
  creditsGrantedToday: number;
  newUsersToday: number;
  paidOrdersToday: number;
  revenueTodayMinor: number;
  totalUsers: number;
}

export type AdminOrderStatus = 'closed' | 'failed' | 'paid' | 'pending';
export type AdminOrderType = 'credit_pack' | 'subscription';

export interface AdminOrderRow {
  amountMinor: number;
  createdAt: string;
  credits: number;
  currency: 'CNY';
  id: string;
  orderNo: string;
  paymentProvider: 'alipay' | 'stripe';
  status: AdminOrderStatus;
  type: AdminOrderType;
  userDisplay: string;
  userId: string;
}

export type ModelPriceMode = 'per_request' | 'token';

export interface AdminModelPrice {
  enabled: boolean;
  id: string;
  inputCredits: number;
  mode: ModelPriceMode;
  model: string;
  outputCredits: number;
  provider: string;
  requestCredits: number;
  updatedAt: string;
}

export interface AuditLog {
  action: AdminPermission | 'user:unban';
  actor: string;
  createdAt: string;
  id: string;
  metadata: Record<string, unknown>;
  reason: string;
  targetId: string;
  targetType: 'config' | 'order' | 'price' | 'user';
}

export interface AlipayConfig {
  alipayPublicKeyConfigured: boolean;
  appId: string;
  enabled: boolean;
  notifyUrl: string;
  privateKeyConfigured: boolean;
  returnUrl: string;
  sandbox: boolean;
  signType: 'RSA2';
}

export interface AlipayConfigUpdate extends Omit<
  AlipayConfig,
  'alipayPublicKeyConfigured' | 'privateKeyConfigured'
> {
  /** 留空或仅空白字符时不覆盖服务端已有值。 */
  alipayPublicKey?: string;
  /** 留空或仅空白字符时不覆盖服务端已有值。 */
  privateKey?: string;
}

export type SmtpProviderPreset =
  '126' | '163' | 'aliyun' | 'custom' | 'gmail' | 'outlook' | 'qq' | 'sendgrid';

export interface SmtpConfig {
  enabled: boolean;
  enableEmailRegister: boolean;
  fromEmail: string;
  fromName: string;
  host: string;
  passwordConfigured: boolean;
  port: number;
  provider: SmtpProviderPreset;
  secure: boolean;
  username: string;
}

export interface SmtpConfigUpdate extends Omit<SmtpConfig, 'passwordConfigured'> {
  /** 留空或仅空白字符时不覆盖服务端已有值。 */
  password?: string;
}

export type SmsProvider = 'aliyun_pnvs' | 'mock';

export interface SmsConfig {
  accessKeyIdConfigured: boolean;
  accessKeyIdMasked: string | null;
  accessKeySecretConfigured: boolean;
  configured: boolean;
  enabled: boolean;
  enablePhoneRegister: boolean;
  mock: boolean;
  provider: SmsProvider;
  schemeName: string | null;
  signName: string | null;
  templateCode: string | null;
}

export interface SmsConfigUpdate {
  accessKeyId?: string;
  accessKeySecret?: string;
  enabled?: boolean;
  enablePhoneRegister?: boolean;
  mock?: boolean;
  provider?: SmsProvider;
  schemeName?: string | null;
  signName?: string | null;
  templateCode?: string | null;
}

export interface PageQuery {
  page: number;
  pageSize: number;
}

export interface UserListQuery extends PageQuery {
  query?: string;
}

export interface OrderListQuery extends PageQuery {
  status?: AdminOrderStatus;
}

export interface AuditListQuery extends PageQuery {
  query?: string;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AdjustBalanceInput {
  deltaCredits: number;
  reason: string;
  userId: string;
}

export interface SetUserBanInput {
  banned: boolean;
  reason: string;
  userId: string;
}
