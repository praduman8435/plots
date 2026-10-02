/**
 * Dev seed — Chandigarh tricity (primary, live) + Azamgarh (live) + upcoming
 * cities, an admin, demo sellers with fixed Seller IDs, plots in every status
 * (live, pending, edited, awaiting availability reply, unavailable, sold),
 * enquiries, a WhatsApp thread and a small sample of analytics events.
 * Wipes marketplace data first. Refuses to run in production.
 *
 *   pnpm db:seed
 *
 * Admin:  admin@plots.local / plots-admin-123   (→ /admin/login)
 * Seller: e.g. SLR-GRPT28 (Chandigarh) or SLR-RMSH27 (Azamgarh) at /seller —
 *         in local dev the WhatsApp code is shown on screen.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { AreaUnit, IdentityStatus, LandType, ListingSource, ListingStatus, SellerType } from "../src/generated/prisma/enums";
import { generatePropertyCode } from "../src/lib/codes";
import { buildTitle } from "../src/lib/land";
import { hashSecret } from "../src/lib/scrypt-hash";
import { slugify } from "../src/lib/slug";
import { toSqft } from "../src/lib/units";

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to seed a production database.");
}

// Remote (non-local) databases must not get the well-known dev admin password.
const isLocalDb = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DIRECT_URL || process.env.DATABASE_URL || "");
const adminPassword = process.env.SEED_ADMIN_PASSWORD || (isLocalDb ? "plots-admin-123" : "");
if (!adminPassword || adminPassword.length < 12) {
  throw new Error("Set SEED_ADMIN_PASSWORD (12+ characters) to seed a non-local database.");
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL }) });

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const img = (n: number) => `/demo/land-${String(n).padStart(3, "0")}.webp`;

const cities = [
  {
    slug: "chandigarh",
    name: "Chandigarh",
    district: "Chandigarh Tricity",
    state: "Chandigarh",
    latitude: 30.7333,
    longitude: 76.7794,
    bighaInSqft: 9_070, // Punjab/Haryana kachha bigha — rarely used here; verify locally
    marlaInSqft: 272.25, // revenue marla; some GMADA/HSVP sectors quote 225 sq ft — verify
    headline: "Land & plots for sale in Chandigarh Tricity",
    intro:
      "Residential plots, farmland and commercial land across the Chandigarh tricity — Mohali, Panchkula, Zirakpur, New Chandigarh and Kharar. See real photos and prices, and talk to sellers directly on WhatsApp.",
    isLive: true,
    sortOrder: 0,
  },
  {
    slug: "azamgarh",
    name: "Azamgarh",
    district: "Azamgarh",
    state: "Uttar Pradesh",
    latitude: 26.0686,
    longitude: 83.184,
    bighaInSqft: 27_225, // pucca bigha; confirm with local brokers
    marlaInSqft: 272.25,
    headline: "Land & plots for sale in Azamgarh",
    intro:
      "Agricultural land, residential plots and road-facing commercial land across Azamgarh — from Sidhari and Harbanshpur to Bilariyaganj, Mubarakpur and Lalganj. Talk to sellers directly on WhatsApp.",
    isLive: true,
    sortOrder: 1,
  },
  { slug: "lucknow", name: "Lucknow", district: "Lucknow", state: "Uttar Pradesh", latitude: 26.8467, longitude: 80.9462, bighaInSqft: 27_225, marlaInSqft: 272.25, isLive: false, sortOrder: 2 },
  { slug: "varanasi", name: "Varanasi", district: "Varanasi", state: "Uttar Pradesh", latitude: 25.3176, longitude: 82.9739, bighaInSqft: 27_225, marlaInSqft: 272.25, isLive: false, sortOrder: 3 },
  { slug: "jaipur", name: "Jaipur", district: "Jaipur", state: "Rajasthan", latitude: 26.9124, longitude: 75.7873, bighaInSqft: 27_225, marlaInSqft: 272.25, isLive: false, sortOrder: 4 },
];

// Fixed Seller IDs so they're easy to try on /seller. Clearly fake numbers (+91 90000 000xx).
const sellers: { key: string; code: string; name: string; phone: string; sellerType: SellerType; identity: IdentityStatus; masked?: string }[] = [
  // Chandigarh tricity
  { key: "gurpreet", code: "SLR-GRPT28", name: "Gurpreet Singh", phone: "+919000000021", sellerType: "BROKER", identity: "VERIFIED", masked: "XXXX XXXX 4821" },
  { key: "harjeet", code: "SLR-HRJT36", name: "Harjeet Kaur", phone: "+919000000022", sellerType: "OWNER", identity: "VERIFIED", masked: "XXXX XXXX 7310" },
  { key: "rajiv", code: "SLR-RJVS47", name: "Rajiv Sharma", phone: "+919000000023", sellerType: "BROKER", identity: "UNVERIFIED" },
  { key: "amandeep", code: "SLR-AMND59", name: "Amandeep Sidhu", phone: "+919000000024", sellerType: "OWNER", identity: "VERIFIED", masked: "XXXX XXXX 2964" },
  { key: "neeraj", code: "SLR-NRJB62", name: "Neeraj Bansal", phone: "+919000000025", sellerType: "BROKER", identity: "UNVERIFIED" },
  // Azamgarh
  { key: "ramesh", code: "SLR-RMSH27", name: "Ramesh Yadav", phone: "+919000000011", sellerType: "BROKER", identity: "VERIFIED", masked: "XXXX XXXX 5518" },
  { key: "anita", code: "SLR-ANTA35", name: "Anita Singh", phone: "+919000000012", sellerType: "OWNER", identity: "UNVERIFIED" },
  { key: "imran", code: "SLR-MRAN46", name: "Imran Ansari", phone: "+919000000013", sellerType: "BROKER", identity: "UNVERIFIED" },
  { key: "suresh", code: "SLR-SRSH58", name: "Suresh Maurya", phone: "+919000000014", sellerType: "OWNER", identity: "UNVERIFIED" },
  { key: "pooja", code: "SLR-PJRA69", name: "Pooja Rai", phone: "+919000000015", sellerType: "BROKER", identity: "UNVERIFIED" },
];

type SeedListing = {
  seller: string;
  landType: LandType;
  area: number;
  areaUnit: AreaUnit;
  price: number;
  locality: string;
  village?: string;
  lat?: number;
  lng?: number;
  features: string[];
  description: string;
  status: ListingStatus;
  source?: ListingSource;
  ageDays: number;
  /** days since the seller last said "still available" (omit = never confirmed) */
  confirmedDaysAgo?: number;
  /** weekly check delivered N hours ago and not yet answered */
  awaitingReplyHours?: number;
  /** pending again after the seller edited a live listing */
  editedBySeller?: boolean;
  images: number[];
  enquiries?: number;
  rejectionReason?: string;
};

const chandigarhListings: SeedListing[] = [
  {
    seller: "gurpreet", landType: "RESIDENTIAL_PLOT", area: 250, areaUnit: "SQYD", price: 1_55_00_000,
    locality: "Sector 82, JLPL, Airport Road", village: "Sector 82, Mohali", lat: 30.6672, lng: 76.7369,
    features: ["Road facing", "Gated colony", "Electricity"],
    description: "East-facing 250 sq yd plot in JLPL Sector 82, two minutes from Airport Road. Park-facing, all services in place, construction allowed immediately. Clear GMADA-approved layout as per seller.",
    status: "ACTIVE", source: "WHATSAPP", ageDays: 3, confirmedDaysAgo: 1, images: [125, 96, 49], enquiries: 6,
  },
  {
    seller: "harjeet", landType: "RESIDENTIAL_PLOT", area: 200, areaUnit: "SQYD", price: 1_12_00_000,
    locality: "Aerocity, Block D", village: "Aerocity, Mohali", lat: 30.6762, lng: 76.7742,
    features: ["Corner plot", "Gated colony", "Road facing"],
    description: "Corner plot in Aerocity Block D, close to the international airport and IT City. Wide 60 ft road on one side. Selling directly — no brokerage.",
    status: "ACTIVE", ageDays: 2, confirmedDaysAgo: 0, images: [49, 125, 96], enquiries: 4,
  },
  {
    seller: "amandeep", landType: "RESIDENTIAL_PLOT", area: 300, areaUnit: "SQYD", price: 1_38_00_000,
    locality: "Eco City 2, Mullanpur", village: "New Chandigarh", lat: 30.7912, lng: 76.7051,
    features: ["Gated colony", "Electricity", "Water source"],
    description: "300 sq yd plot in GMADA Eco City 2, New Chandigarh, with views of the Shivalik hills. Near Omaxe and the Medicity. Calm, green location — 15 minutes to Sector 17.",
    status: "ACTIVE", ageDays: 5, confirmedDaysAgo: 2, images: [96, 49, 122], enquiries: 3,
  },
  {
    seller: "rajiv", landType: "COMMERCIAL", area: 150, areaUnit: "SQYD", price: 1_85_00_000,
    locality: "VIP Road, near Mayfair", village: "Zirakpur", lat: 30.6431, lng: 76.8193,
    features: ["Road facing", "Near highway", "Corner plot"],
    description: "Commercial SCO site on VIP Road, Zirakpur — heavy footfall, surrounded by societies. Ideal for showroom, café or clinic. Chandigarh–Ambala highway 1 km.",
    status: "ACTIVE", source: "WHATSAPP", ageDays: 4, images: [117, 118, 125], enquiries: 7,
  },
  {
    seller: "neeraj", landType: "RESIDENTIAL_PLOT", area: 10, areaUnit: "MARLA", price: 48_00_000,
    locality: "Landran Road, Sunny Enclave", village: "Kharar", lat: 30.7286, lng: 76.6512,
    features: ["Road facing", "Electricity"],
    description: "10 marla residential plot off Landran Road, Kharar. Developed area with schools and markets nearby; 20 minutes to Mohali Phase 7.",
    status: "ACTIVE", source: "WHATSAPP", ageDays: 9, awaitingReplyHours: 6, images: [180, 96], enquiries: 2,
  },
  {
    seller: "harjeet", landType: "RESIDENTIAL_PLOT", area: 1, areaUnit: "KANAL", price: 3_20_00_000,
    locality: "Sector 27", village: "Panchkula", lat: 30.6874, lng: 76.8726,
    features: ["Corner plot", "Road facing", "Boundary wall", "Clear title (as per seller)"],
    description: "1 kanal HSVP plot in Sector 27, Panchkula, facing a green belt. Boundary wall done. Ideal for a family home close to Chandigarh's sectors.",
    status: "ACTIVE", ageDays: 6, confirmedDaysAgo: 3, images: [49, 125], enquiries: 5,
  },
  {
    seller: "gurpreet", landType: "AGRICULTURAL", area: 2, areaUnit: "ACRE", price: 2_40_00_000,
    locality: "Pinjore–Kalka road, near Bitna", village: "Pinjore", lat: 30.8012, lng: 76.9238,
    features: ["Road facing", "Water source", "Electricity"],
    description: "2 acre farmland at the foothills near Pinjore with a tubewell and electricity connection. Perfect for a farmhouse or orchard; 35 minutes from Chandigarh.",
    status: "ACTIVE", source: "WHATSAPP", ageDays: 8, confirmedDaysAgo: 1, images: [54, 91, 122], enquiries: 3,
  },
  {
    seller: "amandeep", landType: "AGRICULTURAL", area: 4, areaUnit: "KANAL", price: 1_10_00_000,
    locality: "Mullanpur Garibdass, Siswan road", village: "Mullanpur Garibdass", lat: 30.8025, lng: 76.6812,
    features: ["Road facing", "Water source"],
    description: "Half-acre (4 kanal) of level land on Siswan road with a farm road on two sides. Good for a farmhouse — New Chandigarh is booming around it.",
    status: "ACTIVE", ageDays: 12, images: [57, 41], enquiries: 2,
  },
  {
    seller: "neeraj", landType: "INDUSTRIAL", area: 1, areaUnit: "ACRE", price: 3_50_00_000,
    locality: "Dera Bassi industrial area, Barwala road", village: "Dera Bassi", lat: 30.5871, lng: 76.8432,
    features: ["Near highway", "Electricity", "Road facing"],
    description: "1 acre industrial land in the Dera Bassi focal point area. 3-phase line on the road, truck access, close to the Ambala highway. Suits warehouse or manufacturing.",
    status: "ACTIVE", ageDays: 15, images: [180, 135], enquiries: 1,
  },
  {
    seller: "rajiv", landType: "AGRICULTURAL", area: 3, areaUnit: "ACRE", price: 2_70_00_000,
    locality: "Banur–Landran road", village: "Banur", lat: 30.5532, lng: 76.7098,
    features: ["Road facing", "Water source", "Electricity"],
    description: "3 killa (acre) of fertile wheat–paddy land on the Banur–Landran road. Canal water plus a tubewell. Rising area near the Airport Road extension.",
    status: "ACTIVE", source: "WHATSAPP", ageDays: 11, confirmedDaysAgo: 4, images: [174, 48, 1], enquiries: 2,
  },
  {
    seller: "gurpreet", landType: "COMMERCIAL", area: 500, areaUnit: "SQYD", price: 6_50_00_000,
    locality: "Airport Road, Sector 66A", village: "Mohali", lat: 30.6789, lng: 76.7348,
    features: ["Road facing", "Near highway", "Corner plot"],
    description: "Prime 500 sq yd commercial site fronting Airport Road, Sector 66A. Visible from the main road — suits a showroom, hospital or hotel.",
    status: "ACTIVE", ageDays: 7, confirmedDaysAgo: 0, images: [118, 117], enquiries: 9,
  },
  {
    seller: "neeraj", landType: "RESIDENTIAL_PLOT", area: 150, areaUnit: "SQYD", price: 42_00_000,
    locality: "Sunny Enclave, Sector 125", village: "Kharar", lat: 30.7342, lng: 76.6807,
    features: ["Gated colony", "Electricity"],
    description: "Affordable 150 sq yd plot in Sunny Enclave with internal roads, street lights and a park nearby.",
    status: "ACTIVE", ageDays: 18, images: [96, 125], enquiries: 1,
  },
  {
    seller: "rajiv", landType: "RESIDENTIAL_PLOT", area: 8, areaUnit: "MARLA", price: 55_00_000,
    locality: "Dhakoli, near Shivalik Vihar", village: "Zirakpur", lat: 30.6701, lng: 76.8321,
    features: ["Road facing", "Electricity"],
    description: "8 marla plot in Dhakoli, Zirakpur — walking distance to the market and 10 minutes to Panchkula.",
    status: "ACTIVE", ageDays: 10, images: [125, 49], enquiries: 2,
  },
  {
    seller: "amandeep", landType: "AGRICULTURAL", area: 1.5, areaUnit: "ACRE", price: 75_00_000,
    locality: "Raipur Rani, Naraingarh road", village: "Raipur Rani", lat: 30.5947, lng: 77.0312,
    features: ["Water source"],
    description: "1.5 acre farmland with a seasonal stream along one side. Quiet, scenic area — popular for weekend farmhouses.",
    status: "ACTIVE", ageDays: 20, images: [122, 179], enquiries: 1,
  },
  // Pending approval
  {
    seller: "rajiv", landType: "RESIDENTIAL_PLOT", area: 120, areaUnit: "SQYD", price: 45_00_000,
    locality: "Bhabat road", village: "Zirakpur", lat: 30.6512, lng: 76.8403,
    features: ["Road facing"],
    description: "120 sq yd plot on Bhabat road, close to schools and the Zirakpur flyover.",
    status: "PENDING", source: "WHATSAPP", ageDays: 0, images: [49],
  },
  {
    seller: "harjeet", landType: "RESIDENTIAL_PLOT", area: 160, areaUnit: "SQYD", price: 62_00_000,
    locality: "Peer Muchalla, near Sector 20 Panchkula", village: "Peer Muchalla", lat: 30.6648, lng: 76.8502,
    features: ["Gated colony", "Electricity"],
    description: "160 sq yd plot in a gated society at Peer Muchalla. Price reduced — seller edited the listing.",
    status: "PENDING", ageDays: 14, editedBySeller: true, images: [96, 125],
  },
  // Lifecycle examples
  {
    seller: "neeraj", landType: "RESIDENTIAL_PLOT", area: 5, areaUnit: "MARLA", price: 32_00_000,
    locality: "Nayagaon, near PGI", village: "Nayagaon", lat: 30.7716, lng: 76.7911,
    features: ["Electricity"],
    description: "5 marla plot in Nayagaon close to PGI.",
    status: "SOLD", ageDays: 40, images: [180], enquiries: 8,
  },
  {
    seller: "gurpreet", landType: "AGRICULTURAL", area: 2, areaUnit: "ACRE", price: 1_20_00_000,
    locality: "Kurali–Ropar road", village: "Kurali", lat: 30.8327, lng: 76.5745,
    features: ["Road facing"],
    description: "Farmland near Kurali. Hidden because the seller didn't reply to the weekly availability check.",
    status: "HIDDEN", ageDays: 30, images: [48, 57],
  },
];

const azamgarhListings: SeedListing[] = [
  {
    seller: "ramesh", landType: "AGRICULTURAL", area: 2, areaUnit: "BIGHA", price: 18_00_000,
    locality: "Near Sathiyaon market", village: "Sathiyaon", lat: 26.112, lng: 83.152,
    features: ["Road facing", "Water source", "Electricity"],
    description: "Fertile, level farmland currently under wheat. Tubewell connection on the boundary and a 12 ft kharanja road on the east side. 20 minutes from Azamgarh city.",
    status: "ACTIVE", source: "WHATSAPP", ageDays: 1, confirmedDaysAgo: 0, images: [90, 182, 1], enquiries: 4,
  },
  {
    seller: "anita", landType: "RESIDENTIAL_PLOT", area: 1_500, areaUnit: "SQFT", price: 27_00_000,
    locality: "Harbanshpur, behind Sanjay Gandhi Inter College", lat: 26.058, lng: 83.158,
    features: ["Road facing", "Boundary wall", "Electricity"],
    description: "East-facing residential plot in a developed colony. 20 ft road in front, houses on both sides, electricity pole adjacent. Owner selling directly — no brokerage.",
    status: "ACTIVE", ageDays: 2, images: [125, 96, 49], enquiries: 2,
  },
  {
    seller: "imran", landType: "COMMERCIAL", area: 400, areaUnit: "SQYD", price: 96_00_000,
    locality: "Sidhari, on Azamgarh–Varanasi road", lat: 26.075, lng: 83.205,
    features: ["Road facing", "Near highway", "Corner plot"],
    description: "Prime corner plot with 60 ft frontage on the main Varanasi road. Ideal for a showroom, hospital or hotel. Heavy daily traffic, all utilities on the road.",
    status: "ACTIVE", source: "WHATSAPP", ageDays: 3, images: [117, 118, 180], enquiries: 7,
  },
  {
    seller: "suresh", landType: "AGRICULTURAL", area: 5, areaUnit: "BIGHA", price: 35_00_000,
    locality: "Bilariyaganj block", village: "Kasba Sagri", lat: 26.19, lng: 83.232,
    features: ["Water source", "Clear title (as per seller)"],
    description: "Single-piece agricultural land, double-crop. Canal water in season and a private borewell. Family land — owner will meet in person and show the khatauni.",
    status: "ACTIVE", ageDays: 5, images: [44, 45, 41], enquiries: 1,
  },
  {
    seller: "pooja", landType: "RESIDENTIAL_PLOT", area: 200, areaUnit: "SQYD", price: 22_00_000,
    locality: "Mubarakpur, near Ali Nagar", lat: 26.091, lng: 83.29,
    features: ["Gated colony", "Electricity", "Road facing"],
    description: "Plot in a new gated layout with internal 25 ft roads, street lights and drainage under construction. Multiple sizes available — this one is 200 gaj.",
    status: "ACTIVE", ageDays: 4, images: [49, 174, 125], enquiries: 3,
  },
  {
    seller: "ramesh", landType: "AGRICULTURAL", area: 1.5, areaUnit: "ACRE", price: 42_00_000,
    locality: "Nizamabad road", village: "Farihan", lat: 26.052, lng: 83.01,
    features: ["Road facing", "Electricity"],
    description: "1.5 acre level land with pakki road access. Suitable for farming, poultry or a weekend farmhouse. Boundaries clearly marked with pillars.",
    status: "ACTIVE", source: "WHATSAPP", ageDays: 8, images: [48, 57, 1],
  },
  {
    seller: "imran", landType: "INDUSTRIAL", area: 1, areaUnit: "HECTARE", price: 1_45_00_000,
    locality: "Manduri, near airport road", lat: 26.135, lng: 83.13,
    features: ["Near highway", "Electricity", "Road facing"],
    description: "Large flat parcel suitable for a warehouse, cold storage or small manufacturing unit. 3-phase power line on the road and easy truck access.",
    status: "ACTIVE", ageDays: 11, images: [180, 118, 135], enquiries: 2,
  },
  {
    seller: "anita", landType: "AGRICULTURAL", area: 15, areaUnit: "BISWA", price: 6_50_000,
    locality: "Rani ki Sarai", village: "Kharihani", lat: 26.0, lng: 83.112,
    features: ["Water source"],
    description: "Small farm plot close to the village, ideal for vegetables or a nursery. Hand pump and a pond nearby.",
    status: "ACTIVE", ageDays: 14, images: [94, 93, 122],
  },
  {
    seller: "pooja", landType: "COMMERCIAL", area: 2_400, areaUnit: "SQFT", price: 58_00_000,
    locality: "Matbarganj, near Collectorate", lat: 26.066, lng: 83.186,
    features: ["Road facing", "Corner plot", "Electricity"],
    description: "City-centre commercial plot, walking distance to the Collectorate and civil court. Suits offices, a clinic or a coaching centre.",
    status: "ACTIVE", source: "WHATSAPP", ageDays: 2, images: [118, 117, 125], enquiries: 5,
  },
  {
    seller: "suresh", landType: "RESIDENTIAL_PLOT", area: 1_000, areaUnit: "SQFT", price: 9_50_000,
    locality: "Jahanaganj bazaar", lat: 25.93, lng: 83.27,
    features: ["Electricity"],
    description: "Affordable residential plot near Jahanaganj bazaar with 10 ft lane access. Good for a first home.",
    status: "ACTIVE", ageDays: 19, images: [96, 49],
  },
  {
    seller: "ramesh", landType: "AGRICULTURAL", area: 4, areaUnit: "BIGHA", price: 30_00_000,
    locality: "Kaptanganj", village: "Bhitari", lat: 26.03, lng: 83.33,
    features: ["Road facing", "Water source"],
    description: "Mustard and wheat land in one block, 200 m from the Kaptanganj–Azamgarh road. Irrigation channel along the north boundary.",
    status: "ACTIVE", source: "WHATSAPP", ageDays: 6, images: [66, 74, 82], enquiries: 3,
  },
  {
    seller: "anita", landType: "AGRICULTURAL", area: 3, areaUnit: "BIGHA", price: 19_50_000,
    locality: "Atraulia", village: "Sarai Mohiuddin", lat: 26.33, lng: 82.95,
    features: ["Water source", "Clear title (as per seller)"],
    description: "Shaded field with a large mango tree, borewell and a mud track to the village road. Calm location, ideal for a farmhouse.",
    status: "ACTIVE", ageDays: 9, images: [54, 91],
  },
  {
    seller: "suresh", landType: "AGRICULTURAL", area: 2.5, areaUnit: "ACRE", price: 48_00_000,
    locality: "Lalganj", village: "Devgaon", lat: 25.82, lng: 82.99,
    features: ["Road facing", "Water source", "Electricity"],
    description: "Green, irrigated land on the Lalganj–Mehnagar road. Electricity connection for the tubewell already in place.",
    status: "ACTIVE", ageDays: 16, images: [122, 179], enquiries: 1,
  },
  {
    seller: "pooja", landType: "AGRICULTURAL", area: 6, areaUnit: "BIGHA", price: 39_00_000,
    locality: "Tarwa", village: "Tarwa Khas", lat: 25.98, lng: 83.03,
    features: ["Water source"],
    description: "Paddy land in a low-lying, well-watered belt. Two crops a year. Will sell as one block or in two parts.",
    status: "ACTIVE", source: "WHATSAPP", ageDays: 22, images: [93, 94],
  },
  {
    seller: "imran", landType: "RESIDENTIAL_PLOT", area: 150, areaUnit: "SQYD", price: 13_50_000,
    locality: "Phoolpur, near tehsil", lat: 26.15, lng: 82.9,
    features: ["Road facing", "Electricity"],
    description: "Residential plot near the Phoolpur tehsil office and market. 15 ft road, neighbours already built.",
    status: "ACTIVE", ageDays: 25, images: [125, 96],
  },
  {
    seller: "ramesh", landType: "COMMERCIAL", area: 1, areaUnit: "BIGHA", price: 85_00_000,
    locality: "Gambhirpur, on NH-233", lat: 26.0, lng: 82.95,
    features: ["Near highway", "Road facing"],
    description: "Highway-facing land suitable for a petrol pump, dhaba or marriage lawn. 120 ft frontage on the national highway.",
    status: "ACTIVE", ageDays: 12, images: [117, 180], enquiries: 2,
  },
  // Waiting for verification (shows in the admin review queue)
  {
    seller: "ramesh", landType: "AGRICULTURAL", area: 3, areaUnit: "BIGHA", price: 21_00_000,
    locality: "Mehnagar", village: "Gaura", lat: 25.88, lng: 83.11,
    features: ["Road facing", "Water source"],
    description: "Irrigated land on the Mehnagar–Lalganj road with a pucca boundary on one side.",
    status: "PENDING", source: "WHATSAPP", ageDays: 0, images: [82, 74],
  },
  {
    seller: "pooja", landType: "RESIDENTIAL_PLOT", area: 150, areaUnit: "SQYD", price: 16_00_000,
    locality: "Atraulia, near tehsil", lat: 26.33, lng: 82.95,
    features: ["Road facing"],
    description: "Residential plot close to the Atraulia tehsil office, in a growing colony.",
    status: "PENDING", ageDays: 0, images: [174],
  },
  // Lifecycle examples
  {
    seller: "imran", landType: "COMMERCIAL", area: 300, areaUnit: "SQYD", price: 75_00_000,
    locality: "Phoolpur bazaar", lat: 26.15, lng: 82.9,
    features: ["Road facing"],
    description: "Market-front commercial plot in Phoolpur bazaar.",
    status: "SOLD", ageDays: 60, images: [138], enquiries: 9,
  },
  {
    seller: "suresh", landType: "AGRICULTURAL", area: 4, areaUnit: "BIGHA", price: 26_00_000,
    locality: "Lalganj", village: "Bindwal", lat: 25.82, lng: 82.99,
    features: ["Water source"],
    description: "Farmland near Bindwal. Hidden because the seller hasn't confirmed it is still available.",
    status: "HIDDEN", ageDays: 45, images: [91, 54],
  },
];

const buyerNames = ["Amit Kumar", "Simran Kaur", "Vikas Pandey", "Neha Gupta", "Rahul Sharma", "Manpreet Gill", "Farhan Siddiqui", "Priya Tiwari", "Deepak Yadav", "Ankit Bansal"];

async function main() {
  // Wipe marketplace data (cascades to images, enquiries, messages, sessions, KYC attempts).
  await db.whatsAppConversation.deleteMany();
  await db.property.deleteMany();
  await db.seller.deleteMany();
  await db.otpChallenge.deleteMany();
  await db.analyticsEvent.deleteMany();

  const cityRows = await Promise.all(cities.map((c) => db.city.upsert({ where: { slug: c.slug }, create: c, update: c })));
  const cityBySlug = new Map(cityRows.map((c) => [c.slug, c]));

  await db.adminUser.upsert({
    where: { email: "admin@plots.local" },
    create: { email: "admin@plots.local", name: "Plots Admin", passwordHash: await hashSecret(adminPassword) },
    update: { isActive: true, passwordHash: await hashSecret(adminPassword) },
  });

  const sellerIds = new Map<string, string>();
  for (const s of sellers) {
    const verified = s.identity === "VERIFIED";
    const seller = await db.seller.create({
      data: {
        code: s.code,
        name: s.name,
        phone: s.phone,
        sellerType: s.sellerType,
        phoneVerifiedAt: daysAgo(90),
        onboardedAt: daysAgo(90),
        createdAt: daysAgo(90),
        identityStatus: s.identity,
        identityVerifiedAt: verified ? daysAgo(88) : null,
        identityProvider: verified ? "mock" : null,
        identityReference: verified ? `seed_${s.key}` : null,
        identityMasked: verified ? s.masked : null,
      },
    });
    sellerIds.set(s.key, seller.id);
  }

  let plotCount = 0;
  let enquiryCount = 0;
  const all: [string, SeedListing[]][] = [["chandigarh", chandigarhListings], ["azamgarh", azamgarhListings]];
  for (const [citySlug, list] of all) {
    const city = cityBySlug.get(citySlug)!;
    for (const [i, l] of list.entries()) {
      const title = buildTitle(l);
      const createdAt = daysAgo(l.ageDays);
      const wasLive = l.status !== "PENDING" && l.status !== "REJECTED";
      const publishedAt = wasLive || l.editedBySeller ? new Date(createdAt.getTime() + 3 * HOUR) : null;
      const lastConfirmedAt = l.confirmedDaysAgo != null ? new Date(Date.now() - l.confirmedDaysAgo * DAY - 2 * HOUR) : null;
      const code = generatePropertyCode();

      await db.property.create({
        data: {
          code,
          slug: `${slugify(`${title} ${city.slug}`)}-${code.slice(2).toLowerCase()}`,
          sellerId: sellerIds.get(l.seller)!,
          cityId: city.id,
          source: l.source ?? "WEB",
          title,
          description: l.description,
          landType: l.landType,
          features: l.features,
          locality: l.locality,
          village: l.village,
          latitude: l.lat,
          longitude: l.lng,
          area: l.area,
          areaUnit: l.areaUnit,
          areaSqft: toSqft(l.area, l.areaUnit, city.bighaInSqft, city.marlaInSqft),
          price: BigInt(l.price),
          status: l.status,
          hiddenReason: l.status === "HIDDEN" ? "AVAILABILITY_UNCONFIRMED" : null,
          rejectionReason: l.rejectionReason,
          publishedAt,
          lastConfirmedAt,
          freshnessAt: publishedAt || lastConfirmedAt ? new Date(Math.max(publishedAt?.getTime() ?? 0, lastConfirmedAt?.getTime() ?? 0)) : null,
          lastAvailabilityCheckAt: l.awaitingReplyHours != null ? new Date(Date.now() - l.awaitingReplyHours * HOUR) : l.status === "HIDDEN" ? daysAgo(3) : null,
          availabilityCheckSentAt: l.awaitingReplyHours != null ? new Date(Date.now() - l.awaitingReplyHours * HOUR) : null,
          soldAt: l.status === "SOLD" ? daysAgo(5) : null,
          viewCount: (l.enquiries ?? 0) * 14 + 11 + ((i * 7) % 23),
          createdAt,
          images: { create: l.images.map((n, position) => ({ url: img(n), width: 1600, height: 1200, position })) },
          enquiries: {
            create: Array.from({ length: l.enquiries ?? 0 }, (_, j) => ({
              buyerName: buyerNames[(i + j) % buyerNames.length],
              buyerPhone: `+918${citySlug === "chandigarh" ? "1" : "0"}000${String(i * 10 + j).padStart(5, "0")}`,
              channel: j % 3 === 2 ? "CALL" : "WHATSAPP",
              source: "detail",
              createdAt: new Date(Math.min(Date.now() - HOUR, createdAt.getTime() + (j + 1) * 7 * HOUR)),
            })),
          },
        },
      });
      plotCount++;
      enquiryCount += l.enquiries ?? 0;
    }
  }

  // A sample WhatsApp thread so the admin inbox isn't empty.
  const g = sellers[0];
  const convo = await db.whatsAppConversation.create({
    data: { phone: g.phone, profileName: g.name, sellerId: sellerIds.get(g.key), lastInboundAt: new Date(Date.now() - 2 * HOUR), unreadCount: 1 },
  });
  const t = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000);
  await db.whatsAppMessage.createMany({
    data: [
      { conversationId: convo.id, direction: "INBOUND", type: "text", body: "SELL — Hi, I want to list my land on Plots.", createdAt: t(190) },
      { conversationId: convo.id, direction: "OUTBOUND", type: "text", sentBy: "bot", body: `Sat Sri Akal Gurpreet ji 🙏 Welcome back! Your Seller ID is ${g.code}.\n\nWhat kind of land is it?`, createdAt: t(189) },
      { conversationId: convo.id, direction: "INBOUND", type: "text", body: "Residential plot", createdAt: t(185) },
      { conversationId: convo.id, direction: "OUTBOUND", type: "text", sentBy: "system", body: `✅ Your land has been submitted.\n\n250 sq yd Residential plot in Sector 82, Mohali\n\nWe'll review it and message you when it's live.\n\nSeller ID: *${g.code}*`, createdAt: t(150) },
      { conversationId: convo.id, direction: "INBOUND", type: "text", body: "Thanks ji. I also have a commercial site on Airport Road, will send photos.", createdAt: t(120) },
    ],
  });

  // A small, clearly-marked sample of funnel events so /admin/insights has something to show in dev.
  const ev: { name: string; visitorId?: string; createdAt: Date; props: object }[] = [];
  const visitors = Array.from({ length: 160 }, () => randomUUID());
  visitors.forEach((v, i) => {
    const at = new Date(Date.now() - ((i * 37) % 14) * DAY - (i % 20) * HOUR);
    ev.push({ name: "visit", visitorId: v, createdAt: at, props: { seed: true } });
    if (i % 2 === 0) ev.push({ name: "search", visitorId: v, createdAt: at, props: { seed: true } });
    if (i % 5 < 3) ev.push({ name: "property_view", visitorId: v, createdAt: at, props: { seed: true } });
    if (i % 7 === 0) ev.push({ name: "whatsapp_click", visitorId: v, createdAt: at, props: { seed: true } });
    if (i % 17 === 0) ev.push({ name: "call_click", visitorId: v, createdAt: at, props: { seed: true } });
  });
  for (let i = 0; i < 9; i++) ev.push({ name: "seller_signup_started", createdAt: daysAgo(i), props: { seed: true } });
  for (let i = 0; i < 6; i++) ev.push({ name: "seller_registered", createdAt: daysAgo(i), props: { seed: true } });
  for (let i = 0; i < 7; i++) ev.push({ name: "availability_yes", createdAt: daysAgo(i), props: { seed: true } });
  ev.push({ name: "availability_no", createdAt: daysAgo(5), props: { seed: true } });
  ev.push({ name: "availability_no_response", createdAt: daysAgo(3), props: { seed: true } });
  await db.analyticsEvent.createMany({ data: ev });

  console.log(
    `Seeded ${cityRows.length} cities, 1 admin, ${sellers.length} sellers, ${plotCount} plots, ${enquiryCount} enquiries, 1 WhatsApp thread, ${ev.length} sample events.\n` +
      `Admin:  admin@plots.local${isLocalDb && !process.env.SEED_ADMIN_PASSWORD ? " / plots-admin-123" : " (password from SEED_ADMIN_PASSWORD)"}\nSellers: ${sellers.map((s) => s.code).join(", ")}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
