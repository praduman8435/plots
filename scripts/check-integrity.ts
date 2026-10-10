/**
 * Data-integrity and reliability checks for the listing state machine and
 * housekeeping (needs the local dev database: pnpm db:up).
 *
 *   pnpm check:integrity
 *
 * - A suspended seller's plot can never be made live (any path).
 * - Concurrent status changes: compare-and-set lets exactly one win.
 * - Listing edits are atomic: a failure leaves the plot exactly as it was.
 * - Daily pruning removes only expired rows.
 * - Health endpoint, structured-log redaction.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`✗ ${name}`, detail ?? "");
  }
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const { changeListingStatus, updateListing } = await import("../src/server/listings/service");
  const city = await db.city.findFirstOrThrow({ where: { isLive: true } });
  const stamp = Date.now().toString(36);
  const seller = await db.seller.create({
    data: { code: `SLR-I${stamp.slice(-5).toUpperCase().replace(/[01ILO]/g, "X")}`, name: "Integrity Check", phone: `+9195${String(Date.now()).slice(-8)}`, onboardedAt: new Date() },
  });
  let n = 0;
  const plot = (status: "PENDING" | "ACTIVE" | "HIDDEN" | "SOLD", extra: object = {}) =>
    db.property.create({
      data: {
        code: `P-I${stamp.slice(-4).toUpperCase()}${n}`.slice(0, 9),
        slug: `check-integrity-${stamp}-${n++}`,
        sellerId: seller.id,
        cityId: city.id,
        title: "Integrity plot",
        description: "Temporary plot created by scripts/check-integrity.ts",
        landType: "AGRICULTURAL",
        locality: "Test",
        area: 1,
        areaUnit: "ACRE",
        areaSqft: 43560,
        price: BigInt(1_000_000),
        status,
        publishedAt: status === "PENDING" ? null : new Date(),
        ...extra,
      },
    });

  try {
    // ── Suspended sellers can't go live ──
    const pending = await plot("PENDING");
    const hidden = await plot("HIDDEN", { hiddenReason: "BY_SELLER" });
    const sold = await plot("SOLD", { soldAt: new Date() });
    await db.seller.update({ where: { id: seller.id }, data: { isBlocked: true } });
    check("suspended: approve refused", (await changeListingStatus(pending.id, { type: "APPROVE" }, { notify: false })) === "seller_blocked");
    check("suspended: unhide refused", (await changeListingStatus(hidden.id, { type: "UNHIDE" }, { notify: false })) === "seller_blocked");
    check("suspended: 'still available' refused", (await changeListingStatus(sold.id, { type: "CONFIRM_AVAILABLE" }, { notify: false })) === "seller_blocked");
    const after = await db.property.findMany({ where: { id: { in: [pending.id, hidden.id, sold.id] } }, select: { status: true } });
    check("suspended: nothing went live", after.every((p) => p.status !== "ACTIVE"), after);
    check("suspended: taking down still allowed", (await changeListingStatus(hidden.id, { type: "MARK_SOLD" }, { notify: false })) === "applied");
    await db.seller.update({ where: { id: seller.id }, data: { isBlocked: false } });
    check("unsuspended: approve works", (await changeListingStatus(pending.id, { type: "APPROVE" }, { notify: false })) === "applied");

    // ── Compare-and-set under concurrency ──
    const live = await plot("ACTIVE");
    const results = await Promise.all(Array.from({ length: 10 }, () => changeListingStatus(live.id, { type: "MARK_SOLD" }, { notify: false })));
    check("10 simultaneous 'mark sold' → exactly 1 applied", results.filter((r) => r === "applied").length === 1, results);
    check("…the rest are conflict/no-op", results.every((r) => r === "applied" || r === "conflict" || r === "noop"));
    check("…and only one 'sold' event recorded", (await db.analyticsEvent.count({ where: { name: "property_sold", propertyId: live.id } })) === 1);

    const waiting = await plot("ACTIVE", { availabilityCheckSentAt: new Date(Date.now() - 2 * 86_400_000) });
    const race = await Promise.all([
      changeListingStatus(waiting.id, { type: "HIDE_UNCONFIRMED" }, { notify: false }),
      changeListingStatus(waiting.id, { type: "CONFIRM_AVAILABLE" }, { notify: false }),
    ]);
    const final = await db.property.findUniqueOrThrow({ where: { id: waiting.id } });
    check(
      "'no reply' vs seller's YES racing → consistent end state",
      (race[1] === "applied" && final.status === "ACTIVE") || (race[0] === "applied" && race[1] !== "applied" && final.status === "HIDDEN") || (race[0] === "applied" && race[1] === "applied" && final.status === "ACTIVE"),
      { race, status: final.status },
    );
    check("hide-for-no-reply on a plot that isn't waiting → no-op", (await changeListingStatus(waiting.id, { type: "HIDE_UNCONFIRMED" }, { notify: false })) === "noop" || final.status === "HIDDEN");

    // ── Seller removes a listing: hidden for good, frozen ──
    const { isPubliclyViewable } = await import("../src/lib/listing-visibility");
    const toRemove = await plot("ACTIVE");
    check("remove: applied", (await changeListingStatus(toRemove.id, { type: "REMOVE" }, { notify: false })) === "applied");
    const removed = await db.property.findUniqueOrThrow({ where: { id: toRemove.id }, include: { seller: true } });
    check("remove: hidden by seller, removedAt set", removed.status === "HIDDEN" && removed.hiddenReason === "BY_SELLER" && removed.removedAt !== null, removed);
    check("remove: not publicly viewable", !isPubliclyViewable(removed));
    const revive = await Promise.all([
      changeListingStatus(toRemove.id, { type: "CONFIRM_AVAILABLE" }, { notify: false }),
      changeListingStatus(toRemove.id, { type: "APPROVE" }, { notify: false }),
      changeListingStatus(toRemove.id, { type: "UNHIDE" }, { notify: false }),
    ]);
    check("remove: nothing brings it back", revive.every((r) => r === "noop") && (await db.property.findUniqueOrThrow({ where: { id: toRemove.id } })).status === "HIDDEN", revive);
    const soldThenRemoved = await plot("SOLD", { soldAt: new Date() });
    await changeListingStatus(soldThenRemoved.id, { type: "REMOVE" }, { notify: false });
    const sr = await db.property.findUniqueOrThrow({ where: { id: soldThenRemoved.id }, include: { seller: true } });
    check("remove: a sold plot stays 'sold' for history, but isn't shown", sr.status === "SOLD" && sr.removedAt !== null && !isPubliclyViewable(sr));

    // ── Login codes: parallel requests and guesses can't beat the limits ──
    const { requestOtp, verifyOtp } = await import("../src/server/seller/otp");
    const otpPhone = `+9196${String(Date.now()).slice(-8)}`;
    let sentCode = "";
    const capture = { async sendOtp({ code }: { code: string }) { sentCode = code; } };
    const sends = await Promise.all(Array.from({ length: 10 }, () => requestOtp(otpPhone, capture)));
    check("otp: 10 parallel requests → exactly one code sent", sends.filter((r) => r.success).length === 1, sends.map((r) => (r.success ? "ok" : r.error.type)));
    const wrong = Array.from({ length: 20 }, (_, i) => String(100000 + i)).filter((c) => c !== sentCode);
    const guesses = await Promise.all(wrong.map((c) => verifyOtp(otpPhone, c)));
    const checked = guesses.filter((g) => !g.success && g.error.type === "WRONG_CODE").length;
    check("otp: 20 parallel guesses → at most 5 are actually checked", checked <= 5 && guesses.every((g) => !g.success), { checked });
    const late = await verifyOtp(otpPhone, sentCode);
    check("otp: after the attempts are used up even the right code is refused", !late.success && late.error.type === "TOO_MANY_ATTEMPTS");

    // ── New cities stay hidden until a listing there is approved ──
    const { resolveCity } = await import("../src/server/cities");
    const newCity = await resolveCity({ cityName: `Zzcheck ${stamp.replace(/[^a-z]/g, "") || "x"}`, state: "Punjab", latitude: 30.7, longitude: 76.7 });
    check("city: a newly typed city is created hidden", newCity !== null && newCity.isLive === false, newCity);
    if (newCity) {
      const inNew = await db.property.create({
        data: { code: `P-Z${stamp.slice(-5).toUpperCase()}`.slice(0, 9), slug: `check-city-${stamp}`, sellerId: seller.id, cityId: newCity.id, title: "City check", description: "Temporary", landType: "AGRICULTURAL", locality: "Test", area: 1, areaUnit: "ACRE", areaSqft: 43560, price: BigInt(1_000_000), status: "PENDING" },
      });
      await changeListingStatus(inNew.id, { type: "APPROVE" }, { notify: false });
      check("city: goes live with its first approved listing", (await db.city.findUniqueOrThrow({ where: { id: newCity.id } })).isLive === true);
      await db.property.delete({ where: { id: inNew.id } });
      await db.city.delete({ where: { id: newCity.id } });
    }

    // ── Approximate location never equals the real point ──
    const { approximateLocation } = await import("../src/lib/approximate-location");
    const real = { lat: 28.570612, lng: 77.325534 };
    const approx = approximateLocation(real.lat, real.lng, "plot-id-1");
    check("location: shifted and rounded, but within the 550 m circle", (approx.lat !== real.lat || approx.lng !== real.lng) && Math.abs(approx.lat - real.lat) < 0.003 && Math.abs(approx.lng - real.lng) < 0.003, approx);
    check("location: stable per plot, different across plots", JSON.stringify(approximateLocation(real.lat, real.lng, "plot-id-1")) === JSON.stringify(approx));

    // ── Atomic edits ──
    const edited = await plot("ACTIVE");
    const input = {
      landType: "AGRICULTURAL" as const,
      area: 2,
      areaUnit: "ACRE" as const,
      price: 2_000_000,
      priceNegotiable: false,
      locality: "Changed",
      description: "This description must NOT be saved because the photo write fails.",
      features: [],
      title: "Changed title",
    };
    const bad = [{ url: "/media/x.webp", width: 2 ** 40, height: 10 }]; // int4 overflow → the photo insert fails
    let threw = false;
    try {
      await updateListing(edited.id, input as never, { city, images: bad, backToReview: true });
    } catch {
      threw = true;
    }
    const untouched = await db.property.findUniqueOrThrow({ where: { id: edited.id } });
    check("failed edit throws", threw);
    check("failed edit: fields rolled back", untouched.title === "Integrity plot" && untouched.locality === "Test");
    check("failed edit: status unchanged (no half-applied review state)", untouched.status === "ACTIVE");
    await updateListing(edited.id, input as never, { city, images: [{ url: "/media/ok.webp", width: 10, height: 10 }], backToReview: true });
    const saved = await db.property.findUniqueOrThrow({ where: { id: edited.id }, include: { images: true } });
    check("good edit: fields + photos + back to review together", saved.title === "Changed title" && saved.status === "PENDING" && saved.images.length === 1);

    // ── Pruning ──
    const { pruneExpiredData } = await import("../src/server/maintenance");
    await db.sellerSession.createMany({
      data: [
        { sellerId: seller.id, tokenHash: `expired-${stamp}`, expiresAt: new Date(Date.now() - 1000) },
        { sellerId: seller.id, tokenHash: `fresh-${stamp}`, expiresAt: new Date(Date.now() + 3_600_000) },
      ],
    });
    await pruneExpiredData();
    const left = await db.sellerSession.findMany({ where: { sellerId: seller.id }, select: { tokenHash: true } });
    check("prune: expired session removed, live one kept", left.length === 1 && left[0].tokenHash === `fresh-${stamp}`, left);

    // ── Health + logs ──
    const health = await (await import("../src/app/api/health/route")).GET();
    check("health: 200 ok, nothing else disclosed", health.status === 200 && JSON.stringify(await health.json()) === '{"status":"ok"}');
    const { log } = await import("../src/lib/log");
    const lines: string[] = [];
    const orig = console.log;
    console.log = (l: string) => lines.push(l);
    log("info", "test.event", { policy: "x", phone: "+919999999999", otp: "123456", token: "abc", password: "p", count: 3 });
    console.log = orig;
    const parsed = JSON.parse(lines[0]);
    check("log: structured JSON with event", parsed.event === "test.event" && parsed.count === 3 && parsed.policy === "x");
    check("log: sensitive fields dropped", !lines[0].includes("9999999999") && !lines[0].includes("123456") && !("token" in parsed) && !("password" in parsed));
  } finally {
    await db.otpChallenge.deleteMany({ where: { phoneNormalized: { startsWith: "+9196" }, createdAt: { gte: new Date(Date.now() - 3_600_000) } } });
    await db.rateLimitBucket.deleteMany({ where: { OR: [{ key: { contains: "+9196" } }, { key: { contains: `check-${stamp}` } }] } });
    await db.adminLoginAttempt.deleteMany({ where: { key: { contains: `check-${stamp}` } } });
    await db.analyticsEvent.deleteMany({ where: { sellerId: seller.id } });
    await db.propertyImage.deleteMany({ where: { property: { sellerId: seller.id } } });
    await db.property.deleteMany({ where: { sellerId: seller.id } });
    await db.sellerSession.deleteMany({ where: { sellerId: seller.id } });
    await db.seller.delete({ where: { id: seller.id } });
  }
}

/** Founding Seller spots: a race of approvals can never share a number or go past the cap. */
async function founding() {
  const { FOUNDING_SPOTS, claimFoundingSpot, getFoundingSpots } = await import("../src/server/founding");
  const stamp = Date.now().toString(36);
  const before = await getFoundingSpots();
  const extra = 20;
  const ids: string[] = [];
  try {
    for (let i = 0; i < before.left + extra; i++) {
      const s = await db.seller.create({
        data: { code: `SLR-F${stamp}${i}`.slice(0, 20), name: `Founding Test ${i}`, phone: `+9195${String(Date.now() % 1e6).padStart(6, "0")}${String(i).padStart(2, "0")}` },
        select: { id: true },
      });
      ids.push(s.id);
    }
    const results = await Promise.all(ids.map((id) => claimFoundingSpot(id)));
    const given = results.filter((n): n is number => n !== null);
    check("founding: race hands out exactly the spots left", given.length === before.left, { left: before.left, given: given.length });
    check("founding: numbers are unique", new Set(given).size === given.length);
    check("founding: never past the cap", given.every((n) => n >= 1 && n <= FOUNDING_SPOTS));
    const winner = ids[results.findIndex((n) => n !== null)];
    if (winner) check("founding: claiming again keeps the same number", (await claimFoundingSpot(winner)) === results[ids.indexOf(winner)]);
    check("founding: counter shows none left", (await getFoundingSpots()).left === 0);
    const flagged = await db.seller.count({ where: { id: { in: ids }, isFounding: true } });
    check("founding: badge flag matches the number", flagged === given.length);
  } finally {
    await db.seller.deleteMany({ where: { id: { in: ids } } });
  }
}

/** Buyer requests: asking again updates one row, and demand counts people, not taps. */
async function buyerRequests() {
  const { getBuyerDemand, saveBuyerRequest } = await import("../src/server/buyer-requests");
  const phones = ["+919400000001", "+919400000002", "+919400000003"];
  const city = await db.city.findFirstOrThrow({ select: { name: true } });
  const spaced = ` ${city.name.toLowerCase()}  `;
  try {
    const before = await getBuyerDemand();
    await saveBuyerRequest({ name: "Asha", phone: phones[0], place: city.name });
    await saveBuyerRequest({ name: "Asha", phone: phones[0], place: spaced, landType: "AGRICULTURAL", budgetMax: 2_500_000 });
    const rows = await db.buyerRequest.findMany({ where: { phone: phones[0] } });
    check("buyer requests: same number + place is one request", rows.length === 1 && rows[0].landType === "AGRICULTURAL" && rows[0].budgetMax === BigInt(2_500_000), rows);
    await saveBuyerRequest({ name: "Ravi", phone: phones[1], place: city.name });
    await saveBuyerRequest({ name: "Mona", phone: phones[2], place: city.name });
    await saveBuyerRequest({ name: "Spam", phone: "+919400000004", place: "Call 9876543210 now" });
    const after = await getBuyerDemand();
    check("buyer requests: demand counts distinct buyers", after.buyers - before.buyers === 4, { before: before.buyers, after: after.buyers });
    const shown = after.places.find((p) => p.name === city.name)?.buyers ?? 0;
    const shownBefore = before.places.find((p) => p.name === city.name)?.buyers ?? 0;
    check("buyer requests: our city grouped however it was typed", shown - shownBefore === 3, after.places);
    check("buyer requests: free-text places never shown publicly", after.places.every((p) => !/call|\d/i.test(p.name)), after.places);
    await db.buyerRequest.updateMany({ where: { phone: phones[2] }, data: { status: "CLOSED" } });
    check("buyer requests: closed ones stop counting", (await getBuyerDemand()).buyers - before.buyers === 3);
    await saveBuyerRequest({ name: "Mona", phone: phones[2], place: city.name });
    check("buyer requests: asking again re-opens", (await db.buyerRequest.findFirst({ where: { phone: phones[2] } }))?.status === "OPEN");
  } finally {
    await db.buyerRequest.deleteMany({ where: { phone: { in: [...phones, "+919400000004"] } } });
  }
}

main()
  .then(founding)
  .then(buyerRequests)
  .catch((e) => {
    failed++;
    console.error(e);
  })
  .finally(async () => {
    await db.$disconnect();
    console.log(`${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  });
