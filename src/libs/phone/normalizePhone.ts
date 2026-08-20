/** Mainland China mobile: 11 digits starting with 1. */
const CN_MOBILE_REGEX = /^1\d{10}$/;

/**
 * Normalizes user input to E.164 for China (+86).
 * Accepts: 13800138000, +8613800138000, 8613800138000
 */
export function normalizePhoneToE164(input: string): string | null {
  const trimmed = input.trim().replaceAll(/\s|-/g, '');
  if (!trimmed) return null;

  if (trimmed.startsWith('+86')) {
    const digits = trimmed.slice(3);
    return CN_MOBILE_REGEX.test(digits) ? `+86${digits}` : null;
  }

  if (trimmed.startsWith('86') && trimmed.length === 13) {
    const digits = trimmed.slice(2);
    return CN_MOBILE_REGEX.test(digits) ? `+86${digits}` : null;
  }

  if (CN_MOBILE_REGEX.test(trimmed)) {
    return `+86${trimmed}`;
  }

  return null;
}

/** Display format: 138 0013 8000 (11 digits, no country code). */
export function formatPhoneForDisplay(e164: string): string {
  const digits = e164.replace(/^\+86/, '');
  if (digits.length !== 11) return e164;
  return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
}
