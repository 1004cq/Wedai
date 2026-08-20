export { formatPhoneForDisplay, normalizePhoneToE164 } from '@/libs/phone/normalizePhone';

export const CN_PHONE_REGEX = /^1\d{10}$/;

export const OTP_LENGTH = 6;

/** Converts 11-digit domestic input to E.164 (+86). Returns null when invalid. */
export const toE164FromDomestic = (domestic: string): string | null => {
  const trimmed = domestic.trim().replaceAll(/\s|-/g, '');
  if (!CN_PHONE_REGEX.test(trimmed)) return null;
  return `+86${trimmed}`;
};
