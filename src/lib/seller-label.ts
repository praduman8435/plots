import type { SellerType } from "@/generated/prisma/enums";

/**
 * Everyone who lists land on InstaPlots is simply a "Seller" — buyers don't
 * need to know more, and sellers aren't sorted into owner / broker.
 */
export function sellerLabel(_t?: SellerType): string {
  void _t;
  return "Seller";
}
