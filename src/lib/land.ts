import type { AreaUnit, LandType } from "@/generated/prisma/enums";
import { formatPrice } from "./format";
import { AREA_UNITS, formatArea } from "./units";

export const LAND_TYPES: Record<LandType, { label: string; short: string }> = {
  RESIDENTIAL_PLOT: { label: "Residential plot", short: "Residential" },
  AGRICULTURAL: { label: "Agricultural land", short: "Agricultural" },
  COMMERCIAL: { label: "Commercial land", short: "Commercial" },
  INDUSTRIAL: { label: "Industrial land", short: "Industrial" },
  OTHER: { label: "Land", short: "Other" },
};

/** Crawlable city + type pages: /azamgarh/agricultural-land */
export const LAND_TYPE_SLUGS: Record<LandType, string> = {
  AGRICULTURAL: "agricultural-land",
  RESIDENTIAL_PLOT: "residential-plots",
  COMMERCIAL: "commercial-land",
  INDUSTRIAL: "industrial-land",
  OTHER: "other-land",
};

export function landTypeFromSlug(slug: string): LandType | null {
  const hit = (Object.entries(LAND_TYPE_SLUGS) as [LandType, string][]).find(([, s]) => s === slug);
  return hit ? hit[0] : null;
}

/** One-tap chips on the sell form. Cheap for sellers, high-signal for buyers. */
export const FEATURE_OPTIONS = [
  "Road facing",
  "Near highway",
  "Boundary wall",
  "Electricity",
  "Water source",
  "Corner plot",
  "Gated colony",
  "Clear title (as per seller)",
] as const;

/** Sellers don't write titles — we build a consistent one from the facts. */
export function buildTitle(p: {
  area: number;
  areaUnit: AreaUnit;
  landType: LandType;
  locality: string;
  village?: string | null;
}): string {
  return `${formatArea(p.area, p.areaUnit)} ${LAND_TYPES[p.landType].label} in ${placeName(p)}`;
}

/** "₹9 Lakh / Bigha", "₹1,800 / sq ft" — how buyers compare land. */
export function formatPricePerUnit(price: bigint | number, area: number, unit: AreaUnit): string | null {
  if (!area) return null;
  const per = Math.round(Number(price) / area);
  return `${formatPrice(per)} / ${AREA_UNITS[unit].short}`;
}

/** "Raidopur Colony, near Bypass" → "Raidopur Colony" — the short place name for titles and cards. */
export function placeName(p: { locality: string; village?: string | null }): string {
  return p.village?.trim() || p.locality.split(/,| near | behind | on | opposite /i)[0].trim() || p.locality.trim();
}
