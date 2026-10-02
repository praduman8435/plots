import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// Ported from the shop project. Memory-hard hashing for admin passwords and
// OTP codes (a 6-digit space is cheap to brute-force against a fast hash).
const scrypt = promisify(scryptCallback);
const SALT_BYTES = 16;
const KEY_LENGTH = 64;

/** Stored form is `salt:hash`, both hex. Never store or log the plaintext. */
export async function hashSecret(plainSecret: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derivedKey = (await scrypt(plainSecret, salt, KEY_LENGTH)) as Buffer;
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

/** Constant-time comparison. */
export async function verifySecretHash(params: { plainSecret: string; storedHash: string }): Promise<boolean> {
  const [saltHex, hashHex] = params.storedHash.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = (await scrypt(params.plainSecret, Buffer.from(saltHex, "hex"), expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
