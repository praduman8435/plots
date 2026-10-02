import { UNAMBIGUOUS_ALPHABET, generateUnambiguousCode } from "./unambiguous-code";

const SELLER_PREFIX = "SLR";
const PROPERTY_PREFIX = "P";
const SUFFIX_LENGTH = 6;

/**
 * Permanent Seller ID, e.g. SLR-7A41K2. Random (not sequential like SLR-10482) so IDs
 * can't be enumerated. Uniqueness is guaranteed by the
 * database constraint; callers retry on collision (see createWithUniqueCode).
 * An IDENTIFIER, not a credential — signing in always needs the OTP.
 */
export function generateSellerCode(): string {
  return `${SELLER_PREFIX}-${generateUnambiguousCode(SUFFIX_LENGTH)}`;
}

/** Plot reference, e.g. P-7Q2M4K — buyers quote it when they call. */
export function generatePropertyCode(): string {
  return `${PROPERTY_PREFIX}-${generateUnambiguousCode(SUFFIX_LENGTH)}`;
}

// Also accepts the older PLT- prefix so IDs sent before the rename keep working.
const SELLER_CODE_PATTERN = new RegExp(`^(?:${SELLER_PREFIX}|PLT)-?([${UNAMBIGUOUS_ALPHABET}]{${SUFFIX_LENGTH}})$`);

/** Accepts "slr-7a41k2", "SLR7A41K2", " PLT-7A41K2 " → "SLR-7A41K2"; otherwise null. */
export function parseSellerCode(raw: string): string | null {
  const m = raw.trim().toUpperCase().replace(/\s+/g, "").match(SELLER_CODE_PATTERN);
  return m ? `${SELLER_PREFIX}-${m[1]}` : null;
}

/** Retries `create` with fresh codes if a unique-constraint collision occurs. */
export async function createWithUniqueCode<T>(
  generate: () => string,
  create: (code: string) => Promise<T>,
  attempts = 5,
): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await create(generate());
    } catch (err) {
      const isUniqueViolation = (err as { code?: string })?.code === "P2002";
      if (!isUniqueViolation || i >= attempts - 1) throw err;
    }
  }
}
