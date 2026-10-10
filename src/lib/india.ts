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
  // Hindi (Devanagari) names, for sellers chatting in Hindi.
  "उत्तर प्रदेश": "Uttar Pradesh", "यूपी": "Uttar Pradesh", "बिहार": "Bihar", "मध्य प्रदेश": "Madhya Pradesh",
  "राजस्थान": "Rajasthan", "पंजाब": "Punjab", "हरियाणा": "Haryana", "दिल्ली": "Delhi", "गुजरात": "Gujarat",
  "महाराष्ट्र": "Maharashtra", "उत्तराखंड": "Uttarakhand", "उत्तराखण्ड": "Uttarakhand", "हिमाचल प्रदेश": "Himachal Pradesh",
  "झारखंड": "Jharkhand", "झारखण्ड": "Jharkhand", "छत्तीसगढ़": "Chhattisgarh", "छत्तीसगढ": "Chhattisgarh",
  "पश्चिम बंगाल": "West Bengal", "ओडिशा": "Odisha", "उड़ीसा": "Odisha", "चंडीगढ़": "Chandigarh", "चण्डीगढ़": "Chandigarh",
  "जम्मू और कश्मीर": "Jammu and Kashmir", "जम्मू कश्मीर": "Jammu and Kashmir", "कर्नाटक": "Karnataka",
  "तेलंगाना": "Telangana", "आंध्र प्रदेश": "Andhra Pradesh", "तमिलनाडु": "Tamil Nadu", "केरल": "Kerala",
  "असम": "Assam", "गोवा": "Goa",
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

type State = (typeof INDIAN_STATES)[number];

/** Asked about most often; fills the state list before we have listings to rank by. */
export const COMMON_STATES: readonly State[] = [
  "Uttar Pradesh", "Punjab", "Haryana", "Rajasthan", "Madhya Pradesh", "Bihar", "Maharashtra", "Uttarakhand", "Gujarat",
];

/**
 * Every state and UT in five regions of at most 10 (a WhatsApp list holds 10 rows),
 * so any state can be picked by tapping: "Other state" → region → state.
 */
export const STATE_REGIONS: readonly { key: string; en: string; hi: string; states: readonly State[] }[] = [
  { key: "north", en: "North India", hi: "उत्तर भारत", states: ["Uttar Pradesh", "Uttarakhand", "Punjab", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Ladakh", "Delhi", "Chandigarh"] },
  { key: "west", en: "West & Central India", hi: "पश्चिम और मध्य भारत", states: ["Rajasthan", "Gujarat", "Maharashtra", "Goa", "Madhya Pradesh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu"] },
  { key: "east", en: "East India", hi: "पूर्वी भारत", states: ["Bihar", "Jharkhand", "West Bengal", "Odisha", "Andaman and Nicobar Islands"] },
  { key: "northeast", en: "North-East", hi: "पूर्वोत्तर भारत", states: ["Assam", "Arunachal Pradesh", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Sikkim", "Tripura"] },
  { key: "south", en: "South India", hi: "दक्षिण भारत", states: ["Andhra Pradesh", "Telangana", "Karnataka", "Tamil Nadu", "Kerala", "Puducherry", "Lakshadweep"] },
];

/** Names that don't fit a WhatsApp list row (24 characters). */
const SHORT_STATE_NAMES: Partial<Record<State, string>> = {
  "Dadra and Nagar Haveli and Daman and Diu": "Dadra, Daman and Diu",
  "Andaman and Nicobar Islands": "Andaman and Nicobar",
};
export function shortStateName(state: State): string {
  return SHORT_STATE_NAMES[state] ?? state;
}
