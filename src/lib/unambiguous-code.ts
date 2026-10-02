import { randomInt } from "node:crypto";

/**
 * No 0/O/1/I/L — so an ID read aloud over the phone is never misheard.
 * Same alphabet as the shop project's customer IDs.
 */
export const UNAMBIGUOUS_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateUnambiguousCode(length: number): string {
  let code = "";
  for (let i = 0; i < length; i++) code += UNAMBIGUOUS_ALPHABET[randomInt(UNAMBIGUOUS_ALPHABET.length)];
  return code;
}
