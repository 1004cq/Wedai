import { z } from 'zod';

import { normalizePhoneToE164 } from '@/libs/phone/normalizePhone';

export const emptyToNull = (value?: string | null) => {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

export const usernameSchema = z
  .string()
  .trim()
  .max(64)
  .nullable()
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return undefined;
    if (value === null || value.length === 0) return null;
    if (!/^\w+$/.test(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Username must be alphanumeric' });
      return z.NEVER;
    }
    return value;
  });

export const emailSchema = z
  .string()
  .trim()
  .max(254)
  .nullable()
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return undefined;
    if (value === null || value.length === 0) return null;
    const parsed = z.string().email().safeParse(value);
    if (!parsed.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid email' });
      return z.NEVER;
    }
    return parsed.data.toLowerCase();
  });

export const phoneSchema = z
  .string()
  .trim()
  .max(32)
  .nullable()
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return undefined;
    if (value === null || value.length === 0) return null;
    const normalized = normalizePhoneToE164(value);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid phone number' });
      return z.NEVER;
    }
    return normalized;
  });

export const adminUserProfileInputSchema = z
  .object({
    email: emailSchema,
    fullName: z.string().trim().max(64).nullable().optional(),
    phoneNumber: phoneSchema,
    role: z.enum(['admin', 'user']).optional(),
    userId: z.string().min(1),
    username: usernameSchema,
  })
  .refine(
    (value) =>
      value.email !== undefined ||
      value.fullName !== undefined ||
      value.phoneNumber !== undefined ||
      value.role !== undefined ||
      value.username !== undefined,
    { message: 'No profile fields to update' },
  );
