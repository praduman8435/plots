import type { Prisma } from "@/generated/prisma/client";

/** Plot code / title / locality / village / seller name / Seller ID / phone. */
export function listingSearchWhere(q: string): Prisma.PropertyWhereInput | undefined {
  const term = q.trim();
  if (!term) return undefined;
  const digits = term.replace(/\D/g, "");
  const or: Prisma.PropertyWhereInput[] = [
    { code: { contains: term, mode: "insensitive" } },
    { title: { contains: term, mode: "insensitive" } },
    { locality: { contains: term, mode: "insensitive" } },
    { village: { contains: term, mode: "insensitive" } },
    { seller: { name: { contains: term, mode: "insensitive" } } },
    { seller: { code: { contains: term, mode: "insensitive" } } },
  ];
  // Phone: match the last digits so "98765 43210", "+91 9876543210" and "3210" all work.
  if (digits.length >= 4 && /^[\d\s+()-]+$/.test(term)) or.push({ seller: { phone: { contains: digits.slice(-10) } } });
  return { OR: or };
}

/** Seller name / Seller ID / phone. */
export function sellerSearchWhere(q: string): Prisma.SellerWhereInput | undefined {
  const term = q.trim();
  if (!term) return undefined;
  const digits = term.replace(/\D/g, "");
  const or: Prisma.SellerWhereInput[] = [
    { name: { contains: term, mode: "insensitive" } },
    { code: { contains: term, mode: "insensitive" } },
  ];
  if (digits.length >= 4 && /^[\d\s+()-]+$/.test(term)) or.push({ phone: { contains: digits.slice(-10) } });
  return { OR: or };
}
