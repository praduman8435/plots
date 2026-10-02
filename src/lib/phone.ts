// Phone normalization — ported from the shop project (src/lib/phone.ts there).
const INDIA_COUNTRY_CODE = "91";
const LOCAL_MOBILE_PATTERN = /^[6-9]\d{9}$/;

export type PhoneNormalizationResult = { valid: true; normalized: string } | { valid: false };

/**
 * 9876543210 / +91 98765 43210 / 919876543210 → +919876543210 (E.164, the
 * form WhatsApp's API uses). A leading 91 is only stripped when the input
 * has 12 digits, so a 10-digit number starting with 91 is never misread.
 */
export function normalizePhoneNumber(rawInput: string): PhoneNormalizationResult {
  let digits = rawInput.replace(/[\s\-()]/g, "").replace(/^\+/, "");
  if (digits.length === 12 && digits.startsWith(INDIA_COUNTRY_CODE)) {
    digits = digits.slice(INDIA_COUNTRY_CODE.length);
  }
  if (!LOCAL_MOBILE_PATTERN.test(digits)) return { valid: false };
  return { valid: true, normalized: `+${INDIA_COUNTRY_CODE}${digits}` };
}

/** +919876543210 → +91••••••10. Never log a raw phone number. */
export function maskPhoneForLogging(phoneNormalized: string): string {
  const digitsOnly = phoneNormalized.replace(/[^\d]/g, "");
  if (digitsOnly.length < 4) return "+••••••••••";
  const countryCode = phoneNormalized.startsWith("+") ? "+" + digitsOnly.slice(0, 2) : "";
  return `${countryCode}••••••${digitsOnly.slice(-2)}`;
}

/** +919876543210 → ••••• •3210, for showing a seller where their code went. */
export function maskPhoneForDisplay(phoneNormalized: string): string {
  return `••••• •${phoneNormalized.slice(-4)}`;
}

/** +919876543210 → 98765 43210 */
export function formatPhone(phoneNormalized: string): string {
  const d = phoneNormalized.replace(/^\+91/, "");
  return d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : phoneNormalized;
}
