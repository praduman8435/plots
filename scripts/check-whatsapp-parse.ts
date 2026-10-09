/**
 * Self-check for the WhatsApp assistant's parsers (no test runner is configured).
 *
 *   pnpm exec tsx scripts/check-whatsapp-parse.ts
 *
 * Exits non-zero if any case fails.
 */
import {
  detectCommand,
  parseLanguage,
  detectFeatures,
  parseArea,
  parseCoordinates,
  parseLandType,
  parseName,
  parsePrice,
  parseSellerType,
  parseUnit,
  looksLikePerUnitPrice,
  parseAvailabilityReply,
  parseListNumber,
} from "../src/server/whatsapp/parse";

let failed = 0;
let passed = 0;

function check<T>(label: string, actual: T, expected: T) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else {
    failed++;
    console.error(`✗ ${label}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
  }
}

// ── parseArea ──
const areaCases: [string, { area: number; unit: string } | null][] = [
  ["2 bigha", { area: 2, unit: "BIGHA" }],
  ["2bigha", { area: 2, unit: "BIGHA" }],
  ["2 Bigha", { area: 2, unit: "BIGHA" }],
  ["2 beegha", { area: 2, unit: "BIGHA" }],
  ["3 bighas", { area: 3, unit: "BIGHA" }],
  ["2 bigha 5 biswa", { area: 2.25, unit: "BIGHA" }],
  ["2 bigha aur 10 biswa", { area: 2.5, unit: "BIGHA" }],
  ["1.5 acre", { area: 1.5, unit: "ACRE" }],
  ["1.5 acres", { area: 1.5, unit: "ACRE" }],
  ["3 ac", { area: 3, unit: "ACRE" }],
  ["1500 sqft", { area: 1500, unit: "SQFT" }],
  ["1500 sq ft", { area: 1500, unit: "SQFT" }],
  ["1500 sq. ft.", { area: 1500, unit: "SQFT" }],
  ["1,500 square feet", { area: 1500, unit: "SQFT" }],
  ["1200 feet", { area: 1200, unit: "SQFT" }],
  ["1200 sft", { area: 1200, unit: "SQFT" }],
  ["200 gaj", { area: 200, unit: "SQYD" }],
  ["200 gaz", { area: 200, unit: "SQYD" }],
  ["200 sq yd", { area: 200, unit: "SQYD" }],
  ["200 square yards", { area: 200, unit: "SQYD" }],
  ["15 biswa", { area: 15, unit: "BISWA" }],
  ["1 hectare", { area: 1, unit: "HECTARE" }],
  ["2 ha", { area: 2, unit: "HECTARE" }],
  ["500 sqm", { area: 500, unit: "SQM" }],
  ["500 sq m", { area: 500, unit: "SQM" }],
  ["500 square metres", { area: 500, unit: "SQM" }],
  ["500 sq mtr", { area: 500, unit: "SQM" }],
  ["2 बीघा", { area: 2, unit: "BIGHA" }],
  ["२ बीघा", { area: 2, unit: "BIGHA" }],
  ["5 बिस्वा", { area: 5, unit: "BISWA" }],
  ["1 एकड़", { area: 1, unit: "ACRE" }],
  ["200 गज", { area: 200, unit: "SQYD" }],
  ["about 2 bigha land", { area: 2, unit: "BIGHA" }],
  ["Total area 2.5 bigha near road", { area: 2.5, unit: "BIGHA" }],
  ["bigha 2", { area: 2, unit: "BIGHA" }],
  ["area: 1200 (sq ft)", { area: 1200, unit: "SQFT" }],
  ["10 marla", { area: 10, unit: "MARLA" }],
  ["10 marle", { area: 10, unit: "MARLA" }],
  ["5 Marla plot", { area: 5, unit: "MARLA" }],
  ["1 kanal", { area: 1, unit: "KANAL" }],
  ["2 kanals", { area: 2, unit: "KANAL" }],
  ["2 kanal 5 marla", { area: 45, unit: "MARLA" }],
  ["1 kanal and 10 marla", { area: 30, unit: "MARLA" }],
  ["2 killa", { area: 2, unit: "ACRE" }],
  ["3 kila", { area: 3, unit: "ACRE" }],
  ["10 मरला", { area: 10, unit: "MARLA" }],
  ["1 कनाल", { area: 1, unit: "KANAL" }],
  ["10 ਮਰਲੇ", { area: 10, unit: "MARLA" }],
  ["੨ ਕਨਾਲ", { area: 2, unit: "KANAL" }],
  ["2 ਕਿੱਲੇ", { area: 2, unit: "ACRE" }],
  ["marla 8", { area: 8, unit: "MARLA" }],
  ["2", null],
  ["1500", null],
  ["two bigha", null],
  ["", null],
  ["0 bigha", null],
];
for (const [input, expected] of areaCases) check(`parseArea(${JSON.stringify(input)})`, parseArea(input), expected);

// ── parseUnit ──
const unitCases: [string, string | null][] = [
  ["bigha", "BIGHA"],
  ["Bigha", "BIGHA"],
  ["sq ft", "SQFT"],
  ["Square feet", "SQFT"],
  ["Gaj (sq yd)", "SQYD"],
  ["gaj", "SQYD"],
  ["acre", "ACRE"],
  ["biswa", "BISWA"],
  ["Square metre", "SQM"],
  ["hectare", "HECTARE"],
  ["बीघा", "BIGHA"],
  ["marla", "MARLA"],
  ["Kanal", "KANAL"],
  ["killa", "ACRE"],
  ["मरला", "MARLA"],
  ["hello", null],
];
for (const [input, expected] of unitCases) check(`parseUnit(${JSON.stringify(input)})`, parseUnit(input), expected);

// ── parsePrice ──
const priceCases: [string, number | null][] = [
  ["18 lakh", 18_00_000],
  ["18 lac", 18_00_000],
  ["18 lacs", 18_00_000],
  ["18 Lakhs", 18_00_000],
  ["18L", 18_00_000],
  ["18 l", 18_00_000],
  ["18.5 lakh", 18_50_000],
  ["1.2 cr", 1_20_00_000],
  ["1.2 crore", 1_20_00_000],
  ["1 करोड़", 1_00_00_000],
  ["25 लाख", 25_00_000],
  ["१८ लाख", 18_00_000],
  ["18,00,000", 18_00_000],
  ["1800000", 18_00_000],
  ["₹ 18 lakh", 18_00_000],
  ["₹18,00,000/-", 18_00_000],
  ["Rs. 18 lakh", 18_00_000],
  ["Rs 25000", 25_000],
  ["50k", 50_000],
  ["50 hazar", 50_000],
  ["1 crore 20 lakh", 1_20_00_000],
  ["1 cr 20 lakh", 1_20_00_000],
  ["18 lakh for 2 bigha", 18_00_000],
  ["price 18 lakh negotiable", 18_00_000],
  ["18", null],
  ["5000", null],
  ["9999", null],
  ["10000", 10_000],
  ["", null],
  ["eighteen lakh", null],
  ["2 bigha 1800000", null],
];
for (const [input, expected] of priceCases) check(`parsePrice(${JSON.stringify(input)})`, parsePrice(input), expected);

check("looksLikePerUnitPrice(5 lakh per bigha)", looksLikePerUnitPrice("5 lakh per bigha"), true);
check("looksLikePerUnitPrice(2000/sqft)", looksLikePerUnitPrice("2000/sqft"), true);
check("looksLikePerUnitPrice(18 lakh)", looksLikePerUnitPrice("18 lakh"), false);

// ── detectCommand ──
const commandCases: [string, string | null][] = [
  ["SELL — Hi, I want to list my land on Plots.", "START"],
  ["SELL — Hi, I want to list my land on InstaPlots.", "START"],
  ["SELL", "START"],
  ["sell", "START"],
  ["Sell my land", "START"],
  ["list", "START"],
  ["new", "START"],
  ["start", "START"],
  ["I want to sell my plot", "START"],
  ["hi", "GREETING"],
  ["Hello!", "GREETING"],
  ["Namaste 🙏", "GREETING"],
  ["नमस्ते", "GREETING"],
  ["status", "STATUS"],
  ["My plots", "STATUS"],
  ["my listings", "STATUS"],
  ["hi status please", "STATUS"],
  ["id", "ID"],
  ["My ID", "ID"],
  ["seller id", "ID"],
  ["YES", "YES"],
  ["haan", "YES"],
  ["ha", "YES"],
  ["han", "YES"],
  ["Available", "YES"],
  ["हाँ", "YES"],
  ["YES, available", "YES"],
  ["YES, all available", "YES"],
  ["SOLD", "SOLD"],
  ["mark as sold", "SOLD"],
  ["NO", "NO"],
  ["no", "NO"],
  ["nahi", "NO"],
  ["nahin", "NO"],
  ["na", "NO"],
  ["नहीं", "NO"],
  ["bik gaya", "NO"],
  ["बिक गया", "NO"],
  ["sold out", "NO"],
  ["NO, it's sold", "NO"],
  ["One is sold", "NO"],
  ["Another is sold", "NO"],
  ["NO 2", "NO"],
  ["no. 2", "NO"],
  ["2 sold", "NO"],
  ["ok no", "NO"],
  ["2", null],
  ["no problem, road is 20 ft", null],
  ["noida", null],
  ["help", "HELP"],
  ["cancel", "CANCEL"],
  ["Stop", "CANCEL"],
  ["exit", "CANCEL"],
  ["talk", "HUMAN"],
  ["Talk to us", "HUMAN"],
  ["agent", "HUMAN"],
  ["call me", "HUMAN"],
  ["menu", "MENU"],
  ["New colony near railway station", null],
  ["Ramesh Yadav", null],
  ["2 bigha", null],
  ["Sathiyaon near panchayat bhawan", null],
  ["selling due to relocation", null],
  ["", null],
];
for (const [input, expected] of commandCases) check(`detectCommand(${JSON.stringify(input)})`, detectCommand(input), expected);

// ── Weekly availability replies ──
const availCases: [string, unknown][] = [
  ["YES", { answer: "YES" }],
  ["haan", { answer: "YES" }],
  ["YES, all available", { answer: "YES" }],
  ["no", { answer: "NO", number: null, plain: true }],
  ["Nahi", { answer: "NO", number: null, plain: true }],
  ["bik gaya", { answer: "NO", number: null, plain: false }],
  ["NO, it's sold", { answer: "NO", number: null, plain: false }],
  ["NO 2", { answer: "NO", number: 2, plain: false }],
  ["no 2", { answer: "NO", number: 2, plain: false }],
  ["No. 3", { answer: "NO", number: 3, plain: false }],
  ["NO #2", { answer: "NO", number: 2, plain: false }],
  ["nahi 2", { answer: "NO", number: 2, plain: false }],
  ["no number 2", { answer: "NO", number: 2, plain: false }],
  ["NO, 2 is sold", { answer: "NO", number: 2, plain: false }],
  ["2 sold", { answer: "NO", number: 2, plain: false }],
  ["plot 2 sold", { answer: "NO", number: 2, plain: false }],
  ["sold 2", { answer: "NO", number: 2, plain: false }],
  ["2 bik gaya", { answer: "NO", number: 2, plain: false }],
  ["no sold 1", { answer: "NO", number: 1, plain: false }],
  ["NO 0", null],
  ["2", null],
  ["2 bigha", null],
  ["no road access", null],
  ["", null],
];
for (const [input, expected] of availCases) check(`parseAvailabilityReply(${JSON.stringify(input)})`, parseAvailabilityReply(input), expected);

const numberCases: [string, number | null][] = [
  ["2", 2],
  [" 3 ", 3],
  ["#2", 2],
  ["2.", 2],
  ["२", 2],
  ["0", null],
  ["2 bigha", null],
  ["NO 2", null],
  ["two", null],
];
for (const [input, expected] of numberCases) check(`parseListNumber(${JSON.stringify(input)})`, parseListNumber(input), expected);

// ── Other answers ──
check("parseSellerType(I'm the owner)", parseSellerType("I'm the owner"), "OWNER");
check("parseSellerType(malik)", parseSellerType("malik"), "OWNER");
check("parseSellerType(I'm a broker)", parseSellerType("I'm a broker"), "BROKER");
check("parseSellerType(property dealer)", parseSellerType("property dealer"), "BROKER");
check("parseSellerType(दलाल)", parseSellerType("दलाल"), "BROKER");
check("parseSellerType(maybe)", parseSellerType("maybe"), null);

check("parseLandType(Agricultural land)", parseLandType("Agricultural land"), "AGRICULTURAL");
check("parseLandType(khet)", parseLandType("khet"), "AGRICULTURAL");
check("parseLandType(Residential plot)", parseLandType("Residential plot"), "RESIDENTIAL_PLOT");
check("parseLandType(house plot)", parseLandType("house plot"), "RESIDENTIAL_PLOT");
check("parseLandType(shop)", parseLandType("shop"), "COMMERCIAL");
check("parseLandType(Industrial land)", parseLandType("Industrial land"), "INDUSTRIAL");
check("parseLandType(1)", parseLandType("1"), "AGRICULTURAL");
check("parseLandType(5)", parseLandType("5"), "OTHER");
check("parseLandType(other)", parseLandType("Other land"), "OTHER");
check("parseLandType(xyz)", parseLandType("xyz"), null);

check("parseCoordinates(pair)", parseCoordinates("26.0686, 83.1840"), { latitude: 26.0686, longitude: 83.184 });
check(
  "parseCoordinates(maps link)",
  parseCoordinates("https://www.google.com/maps/place/@26.0686,83.1840,15z"),
  { latitude: 26.0686, longitude: 83.184 },
);
check("parseCoordinates(none)", parseCoordinates("near the temple"), null);

check(
  "detectFeatures",
  detectFeatures("Road facing plot with bijli and tubewell, boundary done"),
  ["Road facing", "Boundary wall", "Electricity", "Water source"],
);
check("detectFeatures(none)", detectFeatures("Good land"), []);

check("parseName(my name is ramesh yadav)", parseName("my name is ramesh yadav"), "Ramesh Yadav");
check("parseName(Ramesh Yadav)", parseName("Ramesh Yadav"), "Ramesh Yadav");
check("parseName(मेरा नाम सुरेश है)", parseName("मेरा नाम सुरेश है"), "सुरेश");
check("parseName(9876543210)", parseName("9876543210"), null);
check("parseName(x)", parseName("x"), null);

// ── Language + Hindi phrases ──
const languageCases: [string, "en" | "hi" | null][] = [
  ["English", "en"], ["english please", "en"], ["अंग्रेज़ी", "en"], ["1", "en"],
  ["हिंदी", "hi"], ["Hindi", "hi"], ["hindi me", "hi"], ["हिन्दी", "hi"], ["2", "hi"],
  ["hello", null], ["2 bigha", null],
];
for (const [input, expected] of languageCases) check(`parseLanguage(${JSON.stringify(input)})`, parseLanguage(input), expected);
const hindiCommands: [string, string | null][] = [
  ["भाषा", "LANGUAGE"], ["language", "LANGUAGE"], ["hindi", "LANGUAGE"], ["बेचना", "START"], ["ज़मीन लिस्ट करें", "START"],
  ["स्टेटस", "STATUS"], ["मेरी लिस्टिंग", "STATUS"], ["हाँ, उपलब्ध है", "YES"], ["हाँ, सब उपलब्ध", "YES"],
  ["नहीं, बिक गई", "NO"], ["एक बिक गई", "NO"], ["नहीं 2", "NO"], ["बात करनी है", "HUMAN"], ["मेनू", "MENU"],
];
for (const [input, expected] of hindiCommands) check(`detectCommand(${JSON.stringify(input)})`, detectCommand(input), expected);
check("parseAvailabilityReply(नहीं 2)", parseAvailabilityReply("नहीं 2"), { answer: "NO", number: 2, plain: false });
check("parseArea(२ बीघा ५ बिस्वा)", parseArea("२ बीघा ५ बिस्वा"), { area: 2.25, unit: "BIGHA" });
check("parsePrice(१८ लाख)", parsePrice("१८ लाख"), 1_800_000);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
