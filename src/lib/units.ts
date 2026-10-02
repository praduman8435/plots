import type { AreaUnit } from "@/generated/prisma/enums";

type UnitInfo = { label: string; short: string; plural: string };

export const AREA_UNITS: Record<AreaUnit, UnitInfo> = {
  SQFT: { label: "Square feet", short: "sq ft", plural: "sq ft" },
  SQYD: { label: "Square yards (Gaj)", short: "sq yd", plural: "sq yd" },
  SQM: { label: "Square metres", short: "sq m", plural: "sq m" },
  ACRE: { label: "Acre", short: "acre", plural: "acres" },
  HECTARE: { label: "Hectare", short: "ha", plural: "ha" },
  BIGHA: { label: "Bigha", short: "Bigha", plural: "Bigha" },
  BISWA: { label: "Biswa", short: "Biswa", plural: "Biswa" },
  MARLA: { label: "Marla", short: "Marla", plural: "Marla" },
  KANAL: { label: "Kanal", short: "Kanal", plural: "Kanal" },
};

const FIXED_SQFT: Partial<Record<AreaUnit, number>> = {
  SQFT: 1,
  SQYD: 9,
  SQM: 10.7639,
  ACRE: 43_560,
  HECTARE: 107_639.1,
};

/**
 * Convert to square feet. Bigha and Marla differ by region, so callers pass
 * the city's sizes (City.bighaInSqft, City.marlaInSqft).
 * 1 Biswa = 1/20 Bigha · 1 Kanal = 20 Marla.
 */
export function toSqft(area: number, unit: AreaUnit, bighaInSqft: number, marlaInSqft = 272.25): number {
  if (unit === "BIGHA") return area * bighaInSqft;
  if (unit === "BISWA") return (area * bighaInSqft) / 20;
  if (unit === "MARLA") return area * marlaInSqft;
  if (unit === "KANAL") return area * marlaInSqft * 20;
  return area * FIXED_SQFT[unit]!;
}

/** "2 Bigha", "1,200 sq ft", "1.5 acres" */
export function formatArea(area: number, unit: AreaUnit): string {
  const { short, plural } = AREA_UNITS[unit];
  const n = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(area);
  return `${n} ${area === 1 ? short : plural}`;
}

/** A familiar secondary reading: sq ft for small plots, acres for large land. Null when it would just repeat the main figure. */
export function formatSqftHint(areaSqft: number, unit?: AreaUnit): string | null {
  if (unit === "SQFT" && areaSqft < 21_780) return null;
  if ((unit === "ACRE") && areaSqft >= 21_780) return `≈ ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(areaSqft)} sq ft`;
  if (areaSqft >= 21_780) {
    const acres = areaSqft / 43_560;
    return `≈ ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(acres)} acre${acres === 1 ? "" : "s"}`;
  }
  return `≈ ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(areaSqft)} sq ft`;
}
