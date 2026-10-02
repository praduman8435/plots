import "server-only";
import { db } from "@/lib/db";

/**
 * Cheap duplicate signals for admin review (brokers re-post the same land).
 * Flags other non-rejected plots of the same type in the same city that are
 * close in size AND price, and are either from the same seller or within
 * ~1 km. Never auto-rejects — it's a hint for the admin.
 */
export async function findPossibleDuplicates(propertyId: string) {
  const p = await db.property.findUnique({
    where: { id: propertyId },
    select: { id: true, sellerId: true, cityId: true, landType: true, areaSqft: true, price: true, latitude: true, longitude: true, locality: true, village: true },
  });
  if (!p) return [];

  const candidates = await db.property.findMany({
    where: {
      id: { not: p.id },
      cityId: p.cityId,
      landType: p.landType,
      status: { not: "REJECTED" },
      areaSqft: { gte: p.areaSqft * 0.85, lte: p.areaSqft * 1.15 },
      price: { gte: (p.price * BigInt(80)) / BigInt(100), lte: (p.price * BigInt(120)) / BigInt(100) },
    },
    select: {
      id: true, code: true, title: true, status: true, hiddenReason: true, sellerId: true, latitude: true, longitude: true, locality: true, village: true,
      seller: { select: { name: true, code: true } },
    },
    take: 50,
  });

  const place = (x: { locality: string; village: string | null }) => (x.village || x.locality).trim().toLowerCase();
  return candidates
    .map((c) => {
      const km = p.latitude != null && p.longitude != null && c.latitude != null && c.longitude != null ? distanceKm(p.latitude, p.longitude, c.latitude, c.longitude) : null;
      const reasons: string[] = [];
      if (c.sellerId === p.sellerId) reasons.push("same seller");
      if (km != null && km <= 1) reasons.push(`${km < 0.1 ? "same spot" : `${km.toFixed(1)} km away`}`);
      else if (place(c) === place(p)) reasons.push("same locality");
      return { ...c, reasons };
    })
    .filter((c) => c.reasons.length > 0)
    .map((c) => ({ id: c.id, code: c.code, title: c.title, status: c.status, hiddenReason: c.hiddenReason, seller: c.seller, reasons: ["similar size & price", ...c.reasons] }));
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
