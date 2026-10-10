/**
 * Checks for the public seller profile (/s/[slug]).
 *
 *   pnpm check:profile        (needs the local dev database: pnpm db:up)
 *
 * 1. Slug rules (pure): stable, url-safe, unique per Seller ID, same as the SQL backfill.
 * 2. Share links (pure): WhatsApp text is URL-encoded.
 * 3. Visibility + privacy (database): only the seller's ACTIVE plots, never other
 *    statuses or other sellers; blocked/unknown/invalid slugs → null; pagination;
 *    and the returned object contains no private fields.
 *
 * Creates its own temporary seller + plots and deletes them afterwards.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { isValidProfileSlug, profileShareText, sellerProfileSlug, whatsappShareLink } from "../src/lib/seller-profile";
import { getPublicSellerProfile, PROFILE_PAGE_SIZE } from "../src/server/seller/profile";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`✗ ${name}`, detail ?? "");
  }
}

// ── 1. Slugs ──
check("simple name", sellerProfileSlug("Praduman", "SLR-RP44QH") === "praduman-rp44qh", sellerProfileSlug("Praduman", "SLR-RP44QH"));
check("spaces and case", sellerProfileSlug("Ramesh  Kumar Yadav", "SLR-RMSH27") === "ramesh-kumar-yadav-rmsh27");
check("punctuation", sellerProfileSlug("Gupta & Sons (Realty)", "SLR-AB2C3D") === "gupta-sons-realty-ab2c3d");
check("non-latin name falls back", sellerProfileSlug("रमेश यादव", "SLR-AB2C3D") === "seller-ab2c3d");
check("long name capped, no trailing dash", !sellerProfileSlug("a".repeat(39) + " bcdef", "SLR-AB2C3D").includes("--"));
check("stable (same input → same slug)", sellerProfileSlug("Anita Singh", "SLR-ANTA35") === sellerProfileSlug("Anita Singh", "SLR-ANTA35"));
check("unique per Seller ID", sellerProfileSlug("Anita Singh", "SLR-ANTA35") !== sellerProfileSlug("Anita Singh", "SLR-ANTA36"));
check("valid slug accepted", isValidProfileSlug("praduman-rp44qh"));
for (const bad of ["", "UPPER", "../etc", "a b", "x".repeat(80), "-lead", "has_underscore"]) {
  check(`invalid slug rejected: ${JSON.stringify(bad)}`, !isValidProfileSlug(bad));
}

// ── 2. Share links ──
const text = profileShareText("Praduman", "https://plots-red.vercel.app/sellers/praduman-rp44qh");
const wa = whatsappShareLink(text);
check("share text uses public name + url", text.includes("Praduman's") && text.includes("/sellers/praduman-rp44qh"), text);
check("WhatsApp link targets wa.me with no recipient", wa.startsWith("https://wa.me/?text="), wa);
check("WhatsApp text is URL-encoded", decodeURIComponent(wa.slice("https://wa.me/?text=".length)) === text && !wa.slice(20).includes(" "));

// ── 3. Database: visibility, pagination, privacy ──
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const city = await db.city.findFirstOrThrow({ where: { isLive: true } });
  const stamp = Date.now().toString(36).toUpperCase().replace(/[^2-9A-HJ-KMNP-Z]/g, "X").slice(-6).padStart(6, "Z");
  const code = `SLR-${stamp}`;
  const slug = sellerProfileSlug("Profile Check", code);
  const phone = `+9196${String(Date.now()).slice(-8)}`;
  const other = await db.seller.findFirstOrThrow({ where: { NOT: { phone } } });

  const seller = await db.seller.create({
    data: {
      code,
      profileSlug: slug,
      name: "Profile Check",
      phone,
      phoneVerifiedAt: new Date(),
      onboardedAt: new Date(),
      identityStatus: "VERIFIED",
      identityMasked: "XXXX XXXX 9999",
      identityReference: "secret-provider-ref",
    },
  });

  const base = (i: number, status: "PENDING" | "ACTIVE" | "HIDDEN" | "SOLD" | "REJECTED", sellerId = seller.id) => ({
    code: `P-T${stamp.slice(0, 2)}${String(i).padStart(3, "0")}`.slice(0, 8),
    slug: `profile-check-${stamp.toLowerCase()}-${i}`,
    sellerId,
    cityId: city.id,
    title: `Check plot ${i} (${status})`,
    description: "Temporary plot created by scripts/check-seller-profile.ts",
    landType: "AGRICULTURAL" as const,
    locality: "Test locality",
    area: 1,
    areaUnit: "ACRE" as const,
    areaSqft: 43560,
    price: BigInt(1_000_000 + i),
    status,
    hiddenReason: status === "HIDDEN" ? ("AVAILABILITY_UNCONFIRMED" as const) : null,
    publishedAt: status === "PENDING" || status === "REJECTED" ? null : new Date(),
  });
  const active = PROFILE_PAGE_SIZE + 3; // forces a second page
  let n = 0;
  const rows = [
    ...Array.from({ length: active }, () => base(n++, "ACTIVE")),
    base(n++, "PENDING"),
    base(n++, "REJECTED"),
    base(n++, "SOLD"),
    base(n++, "HIDDEN"),
    base(n++, "ACTIVE", other.id), // another seller's live plot
  ];
  await db.property.createMany({ data: rows });

  try {
    const p1 = await getPublicSellerProfile(slug, 1);
    check("profile resolves by slug", p1 !== null);
    if (p1) {
      check("total counts only this seller's ACTIVE plots", p1.total === active, p1.total);
      check("page 1 is capped at page size", p1.listings.length === PROFILE_PAGE_SIZE, p1.listings.length);
      check("pages computed", p1.pages === 2, p1.pages);
      check("every listing is ACTIVE", p1.listings.every((l) => l.status === "ACTIVE"));
      check("no other seller's plots", p1.listings.every((l) => l.seller.name === "Profile Check"));
      check("no pending/rejected/sold/hidden titles", !p1.listings.some((l) => /PENDING|REJECTED|SOLD|HIDDEN/.test(l.title)));
      check("trust badges are booleans", p1.phoneVerified === true && p1.identityVerified === true);

      // Privacy: walk the whole object and look for private fields/values.
      const json = JSON.stringify(p1, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
      for (const secret of ["identityMasked", "identityReference", "XXXX XXXX 9999", "secret-provider-ref", "isBlocked", "onboardedAt", "tokenHash", "rejectionReason", seller.id]) {
        check(`does not expose ${secret}`, !json.includes(secret));
      }
      check("seller phone appears only inside listing contact data", !Object.prototype.hasOwnProperty.call(p1, "phone"));
    }
    const p2 = await getPublicSellerProfile(slug, 2);
    check("page 2 has the remainder", p2?.listings.length === active - PROFILE_PAGE_SIZE, p2?.listings.length);
    const p99 = await getPublicSellerProfile(slug, 99);
    check("out-of-range page clamps to last page", p99?.page === 2, p99?.page);
    check("upper-case slug resolves (case-insensitive)", (await getPublicSellerProfile(slug.toUpperCase(), 1))?.slug === slug);

    check("unknown slug → null", (await getPublicSellerProfile("nobody-zzzzzz", 1)) === null);
    check("invalid slug → null", (await getPublicSellerProfile("../../etc/passwd", 1)) === null);

    // Selling/hiding updates the profile with no manual step.
    const first = await db.property.findFirstOrThrow({ where: { sellerId: seller.id, status: "ACTIVE" } });
    await db.property.update({ where: { id: first.id }, data: { status: "SOLD", soldAt: new Date() } });
    check("selling a plot removes it immediately", (await getPublicSellerProfile(slug, 1))?.total === active - 1);

    await db.seller.update({ where: { id: seller.id }, data: { isBlocked: true } });
    check("blocked seller → null", (await getPublicSellerProfile(slug, 1)) === null);

    await db.property.updateMany({ where: { sellerId: seller.id }, data: { status: "SOLD" } });
    await db.seller.update({ where: { id: seller.id }, data: { isBlocked: false } });
    const empty = await getPublicSellerProfile(slug, 1);
    check("seller with no live plots → empty profile, not null", empty !== null && empty.total === 0 && empty.listings.length === 0);
  } finally {
    await db.property.deleteMany({ where: { slug: { startsWith: `profile-check-${stamp.toLowerCase()}-` } } });
    await db.seller.delete({ where: { id: seller.id } });
  }
}

main()
  .catch((e) => {
    failed++;
    console.error(e);
  })
  .finally(async () => {
    await db.$disconnect();
    console.log(`${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  });
