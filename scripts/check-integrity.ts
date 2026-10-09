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
    await db.analyticsEvent.deleteMany({ where: { sellerId: seller.id } });
    await db.propertyImage.deleteMany({ where: { property: { sellerId: seller.id } } });
    await db.property.deleteMany({ where: { sellerId: seller.id } });
    await db.sellerSession.deleteMany({ where: { sellerId: seller.id } });
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
