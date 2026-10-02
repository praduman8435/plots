/** States and union territories, for the "City / town" field. Safe for client code. */
export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
  "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi",
  "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
] as const;

const ALIASES: Record<string, (typeof INDIAN_STATES)[number]> = {
  up: "Uttar Pradesh", "u.p.": "Uttar Pradesh", mp: "Madhya Pradesh", hp: "Himachal Pradesh", uk: "Uttarakhand",
  tn: "Tamil Nadu", ap: "Andhra Pradesh", wb: "West Bengal", mh: "Maharashtra", rj: "Rajasthan", hr: "Haryana",
  pb: "Punjab", gj: "Gujarat", br: "Bihar", jk: "Jammu and Kashmir", "j&k": "Jammu and Kashmir", ka: "Karnataka",
  kl: "Kerala", od: "Odisha", orissa: "Odisha", ct: "Chhattisgarh", jh: "Jharkhand", ts: "Telangana", dl: "Delhi",
  "new delhi": "Delhi", ncr: "Delhi", pondicherry: "Puducherry", uttaranchal: "Uttarakhand",
};

/** "up", "Uttar pradesh", "Punjab " → canonical state name, or null. */
export function matchState(raw: string): (typeof INDIAN_STATES)[number] | null {
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return null;
  return INDIAN_STATES.find((s) => s.toLowerCase() === key) ?? ALIASES[key] ?? null;
}

/** "Mohali, Punjab" → { name: "Mohali", state: "Punjab" }; "Mohali" → { name: "Mohali" }. */
export function splitCityAndState(raw: string): { name: string; state?: (typeof INDIAN_STATES)[number] } {
  const parts = raw.split(/[,/-]|\sin\s/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const state = matchState(parts[parts.length - 1]);
    if (state) return { name: parts.slice(0, -1).join(" "), state };
  }
  return { name: raw.trim() };
}

/** Title Case for city names typed in any case. */
export function titleCase(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
}
