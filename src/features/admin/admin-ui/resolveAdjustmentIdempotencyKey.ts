/**
 * Optional antd form fields are often `undefined` when untouched.
 * Calling `.trim()` on that value crashes the submit handler before any
 * network request, which made admin credit look like a no-op / hard failure.
 */
export const resolveAdjustmentIdempotencyKey = (
  idempotencyKey: string | undefined,
  userId: string,
  now = Date.now(),
): string => {
  const trimmed = idempotencyKey?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : `admin-${now}-${userId}`;
};
