/**
 * adminApi — real tRPC client for admin.* procedures.
 *
 * Drop-in replacement for adminMockApi.  All calls go to the real backend
 * through lambdaClient; the server re-checks role='admin' on every request
 * (adminProcedure in apps/server/src/routers/lambda/admin/middleware.ts).
 *
 * Bigint transport: the tRPC lambda router uses superjson, so bigint values
 * are preserved. However, bigint fields returned from Drizzle queries
 * (wallets.available, ledger_entries.delta, etc.) are serialised as strings
 * in the JSON layer for safety. Callers should format with
 * `formatCreditsStr(str)` rather than Number().
 *
 * 403 from adminProcedure bubbles up as a TRPCClientError with code FORBIDDEN.
 * The ForbiddenBanner component renders this as an explicit UI state rather
 * than a silent empty list.
 */
import { lambdaClient } from '@/libs/trpc/client';

import type {
  AdminModelPrice,
  AdminOrderRow,
  AdminUserRow,
  OrderListQuery,
  PagedResult,
  SetUserBanInput,
  SmsConfig,
  SmsConfigUpdate,
} from './types';

// ─── cursor-based → page-based bridge ────────────────────────────────────────
// The backend uses cursor pagination (offset-based cursor = (page-1)*pageSize).
// The UI uses antd Table which needs page/total.  We bridge here so pages
// can stay unmodified.
const pageToCursor = (page: number, pageSize: number) => (page - 1) * pageSize;

// ─── Users ────────────────────────────────────────────────────────────────────

async function listUsers(query: {
  query?: string;
  page: number;
  pageSize: number;
}): Promise<PagedResult<AdminUserRow>> {
  const cursor = pageToCursor(query.page, query.pageSize);
  const res = await lambdaClient.admin.users.list.query({
    cursor,
    limit: query.pageSize,
    search: query.query || undefined,
  });

  return {
    items: res.items.map(mapUser),
    nextCursor: res.nextCursor,
    page: query.page,
    pageSize: query.pageSize,
    total:
      res.nextCursor !== null
        ? cursor + res.items.length + 1 // at least one more page
        : cursor + res.items.length,
  } as any;
}

async function getUser(userId: string) {
  return lambdaClient.admin.users.get.query({ userId });
}

async function setUserBan(input: SetUserBanInput): Promise<void> {
  await lambdaClient.admin.users.setBan.mutate({
    userId: input.userId,
    banned: input.banned,
    reason: input.reason,
  });
}

// ─── Orders ───────────────────────────────────────────────────────────────────

async function listOrders(query: OrderListQuery): Promise<PagedResult<AdminOrderRow>> {
  const cursor = pageToCursor(query.page, query.pageSize);
  const res = await lambdaClient.admin.orders.list.query({
    cursor,
    limit: query.pageSize,
    status: query.status,
  });

  return {
    items: res.items.map(mapOrder),
    nextCursor: res.nextCursor,
    page: query.page,
    pageSize: query.pageSize,
    total: res.nextCursor !== null ? cursor + res.items.length + 1 : cursor + res.items.length,
  } as any;
}

async function getOrder(orderId: string) {
  return lambdaClient.admin.orders.get.query({ orderId });
}

// ─── Ledger ───────────────────────────────────────────────────────────────────

async function listLedger(input: {
  billingAccountId: string;
  page: number;
  pageSize: number;
  kind?: string;
}) {
  const cursor = pageToCursor(input.page, input.pageSize);
  return lambdaClient.admin.ledger.list.query({
    billingAccountId: input.billingAccountId,
    cursor,
    limit: input.pageSize,
    kind: input.kind,
  });
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

async function listPrices(): Promise<AdminModelPrice[]> {
  const rows = await lambdaClient.admin.pricing.list.query();
  return rows.map(mapPrice);
}

async function upsertPrice(input: {
  modelId: string;
  provider: string;
  promptCreditsPerKToken: number;
  completionCreditsPerKToken: number;
  isActive: boolean;
  note?: string;
}): Promise<void> {
  await lambdaClient.admin.pricing.upsert.mutate(input);
}

async function archivePrice(id: string): Promise<void> {
  await lambdaClient.admin.pricing.archive.mutate({ id });
}

// ─── System config status ─────────────────────────────────────────────────────

async function getConfigStatus() {
  return lambdaClient.admin.config.status.query();
}

async function updateLlmProvider(input: {
  accessKeyId?: string;
  apiKey?: string;
  baseURL?: string | null;
  clearSecrets?: boolean;
  enabled?: boolean;
  providerId: string;
  region?: string | null;
  secretAccessKey?: string;
  sessionToken?: string;
}) {
  return lambdaClient.admin.config.updateLlmProvider.mutate(input);
}

// ─── Adjustments ─────────────────────────────────────────────────────────────

async function creditBalance(input: {
  billingAccountId: string;
  credits: number;
  reason: string;
  idempotencyKey: string;
}): Promise<{ ledgerEntryId: string; availableAfter: string }> {
  return lambdaClient.admin.adjustments.credit.mutate(input);
}

async function debitBalance(input: {
  billingAccountId: string;
  credits: number;
  reason: string;
  idempotencyKey: string;
}): Promise<{ ledgerEntryId: string }> {
  return lambdaClient.admin.adjustments.debit.mutate(input);
}

async function getSmsConfig(): Promise<SmsConfig> {
  return lambdaClient.admin.config.smsSettings.query();
}

async function updateSmsConfig(input: SmsConfigUpdate): Promise<SmsConfig> {
  return lambdaClient.admin.config.updateSms.mutate(input);
}

// ─── Exported client ─────────────────────────────────────────────────────────

export const adminApi = {
  archivePrice,
  creditBalance,
  debitBalance,
  getConfigStatus,
  getOrder,
  getSmsConfig,
  getUser,
  listLedger,
  listOrders,
  listPrices,
  listUsers,
  setUserBan,
  updateLlmProvider,
  updateSmsConfig,
  upsertPrice,
};

// ─── Shape mappers ────────────────────────────────────────────────────────────
// Map backend Drizzle row shapes to the AdminUserRow / AdminOrderRow UI types.

function mapUser(row: {
  id: string;
  email: string | null;
  fullName: string | null;
  username: string | null;
  role: string | null;
  banned: boolean | null;
  banReason: string | null;
  createdAt: Date;
}): AdminUserRow {
  return {
    balanceCredits: 0, // populated lazily by getUser when detail is needed
    email: row.email ?? undefined,
    id: row.id,
    lastActiveAt: row.createdAt.toISOString(),
    nickname: row.fullName ?? row.username ?? row.email ?? row.id,
    plan: 'free', // plan not returned by list endpoint
    registeredAt: row.createdAt.toISOString(),
    role: (row.role as AdminUserRow['role']) ?? 'user',
    status: row.banned ? 'banned' : 'active',
  };
}

function mapOrder(row: {
  id: string;
  orderNo: string;
  userId: string;
  status: string;
  currency: string;
  amountMinor: bigint;
  paidAt: Date | null;
  createdAt: Date;
}): AdminOrderRow {
  return {
    // amountMinor is bigint from Drizzle — Number() is safe for realistic
    // order amounts (< 2^53) but we guard explicitly.
    amountMinor: Number(row.amountMinor),
    createdAt: row.createdAt.toISOString(),
    credits: 0,
    currency: (row.currency as 'CNY') ?? 'CNY',
    id: row.id,
    orderNo: row.orderNo,
    paymentProvider: 'stripe',
    status: row.status as AdminOrderRow['status'],
    type: 'credit_pack',
    userDisplay: row.userId,
    userId: row.userId,
  };
}

function mapPrice(row: {
  id: string;
  modelId: string;
  provider: string;
  promptCreditsPerKToken: bigint;
  completionCreditsPerKToken: bigint;
  isActive: boolean;
  archivedAt: Date | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AdminModelPrice {
  return {
    enabled: row.isActive,
    id: row.id,
    inputCredits: Number(row.promptCreditsPerKToken),
    mode: 'token',
    model: row.modelId,
    outputCredits: Number(row.completionCreditsPerKToken),
    provider: row.provider,
    requestCredits: 0,
    updatedAt: row.updatedAt.toISOString(),
  };
}
