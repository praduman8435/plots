import type { SellerType } from "@/generated/prisma/enums";

/**
 * Public label for who listed a plot. We never say "Owner": ownership isn't
 * verified (brokers often list for owners). Self-declared owners show as "Seller".
 */
export function sellerLabel(t: SellerType): string {
  return t === "BROKER" ? "Broker" : "Seller";
}
