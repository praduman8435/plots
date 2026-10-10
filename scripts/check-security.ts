/**
 * Security + reporting checks that don't need a running server.
 *
 *   pnpm check:security        (needs the local dev database: pnpm db:up)
 *
 * Pure: hostile search params, image URL / redirect allowlists, TOTP (RFC 6238
 * vectors, replay), MFA secret encryption, env check, report text cleaning,
 * Meta media host allowlist, image upload validation (SVG, fake JPEG,
 * decompression bomb, EXIF stripping), webhook signatures, cron auth.
 * Database: shared rate limiter, report submission (every reason, validation,
 * targets, duplicates, races, rate limits, self-reports, injection payloads,
 * reporter/seller separation), moderation workflow + audit log, report filters.
 *
 * Creates its own temporary sellers / plots / admin and deletes them afterwards.
 */
import "dotenv/config";
import { createHmac, randomBytes } from "node:crypto";
import sharp from "sharp";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// Random per run: test-only values, never a real secret (and nothing for secret scanners to flag).
process.env.WHATSAPP_APP_SECRET = randomBytes(24).toString("hex");
process.env.CRON_SECRET = randomBytes(24).toString("hex");

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`✗ ${name}`, detail ?? "");
  }
}
async function rejects(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function pure() {
  const { parseSearchParams } = await import("../src/server/listings/queries");
  for (const [k, v] of [["sort", "toString"], ["sort", "__proto__"], ["type", "constructor"], ["unit", "hasOwnProperty"]] as const) {
    const f = parseSearchParams({ [k]: v });
    check(`search: ${k}=${v} falls back to default`, k === "sort" ? f.sort === "recommended" : k === "type" ? f.type === undefined : f.areaUnit === "SQFT", f);
  }
  check("search: huge price is clamped inside bigint", (parseSearchParams({ minPrice: "1e30" }).minPrice ?? 0) <= 1e15);
  check("search: page is bounded", parseSearchParams({ page: "99999999" }).page === 500);
  check("search: SQL-ish text is kept as a plain string", parseSearchParams({ q: "' OR 1=1--" }).q === "' OR 1=1--");

  const { isOurImageUrl } = await import("../src/server/storage");
  for (const bad of ["javascript:alert(1)", "data:image/svg+xml,<svg>", "/media/../../etc/passwd", "https://evil.com/plots/a.webp", "//evil.com/x.webp", "/media/a b.webp"]) {
    check(`image url rejected: ${bad}`, !isOurImageUrl(bad));
  }
  const savedBlob = { host: process.env.BLOB_PUBLIC_HOST, token: process.env.BLOB_READ_WRITE_TOKEN };
  process.env.BLOB_PUBLIC_HOST = "abc123.public.blob.vercel-storage.com";
  check("image url accepted: our blob", isOurImageUrl("https://abc123.public.blob.vercel-storage.com/plots/2026/10/x.webp"));
  check("image url rejected: another Vercel customer's blob store", !isOurImageUrl("https://evil999.public.blob.vercel-storage.com/plots/2026/10/x.webp"));
  delete process.env.BLOB_PUBLIC_HOST;
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_AbC123_secretpart";
  check("blob host derived from the store token", isOurImageUrl("https://abc123.public.blob.vercel-storage.com/plots/x.webp") && !isOurImageUrl("https://other1.public.blob.vercel-storage.com/plots/x.webp"));
  delete process.env.BLOB_READ_WRITE_TOKEN;
  check("no blob store configured → blob URLs rejected", !isOurImageUrl("https://abc123.public.blob.vercel-storage.com/plots/x.webp"));
  if (savedBlob.host !== undefined) process.env.BLOB_PUBLIC_HOST = savedBlob.host;
  if (savedBlob.token !== undefined) process.env.BLOB_READ_WRITE_TOKEN = savedBlob.token;

  const { safeNext } = await import("../src/server/seller/onboarding");
  for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "/admin", "javascript:alert(1)", "/sellerx"]) {
    check(`open redirect blocked: ${bad}`, safeNext(bad, "/fallback") === "/fallback");
  }
  check("safe next allowed", safeNext("/seller/dashboard", "/f") === "/seller/dashboard");

  const mfa = await import("../src/lib/admin/mfa");
  const secret = mfa.base32Encode(Buffer.from("12345678901234567890"));
  check("totp RFC 6238 vector t=59", mfa.totpAt(secret, 1) === "287082");
  check("totp RFC 6238 vector t=1111111109", mfa.totpAt(secret, Math.floor(1111111109 / 30)) === "081804");
  const now = 1_700_000_000_000;
  const step = mfa.currentStep(now);
  const code = mfa.totpAt(secret, step);
  check("totp accepts current code", mfa.verifyTotp(secret, code, null, now) === step);
  check("totp accepts previous step (clock drift)", mfa.verifyTotp(secret, mfa.totpAt(secret, step - 1), null, now) === step - 1);
  check("totp rejects a replayed code", mfa.verifyTotp(secret, code, step, now) === null);
  check("totp rejects old codes", mfa.verifyTotp(secret, mfa.totpAt(secret, step - 3), null, now) === null);
  check("totp rejects non-digits", mfa.verifyTotp(secret, "12345a", null, now) === null);
  const enc = mfa.encryptMfaSecret(secret);
  check("mfa secret encrypted at rest", !enc.includes(secret) && mfa.decryptMfaSecret(enc) === secret);
  const parts = enc.split(".");
  parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("A") ? "BB" : "AA");
  check("tampered mfa ciphertext rejected", mfa.decryptMfaSecret(parts.join(".")) === null);
  const codes = mfa.generateRecoveryCodes();
  check("8 distinct recovery codes", new Set(codes).size === 8 && codes.every((c) => /^[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/.test(c)));
  check("recovery code normalisation", mfa.normalizeRecoveryCode(codes[0].toLowerCase().replace(/-/g, " ")) === codes[0]);

  const { toMetaPayload } = await import("../src/server/whatsapp/client");
  const otp = toMetaPayload("+919876543210", { type: "template", templateName: "login_code", language: "en", bodyParameters: ["482913"], copyCode: "482913" }) as {
    to: string;
    template: { components: { type: string; sub_type?: string; index?: string; parameters: { text: string }[] }[] };
  };
  const button = otp.template.components.find((c) => c.type === "button");
  check("whatsapp: OTP template carries the code for the Copy code button", button?.sub_type === "url" && button.index === "0" && button.parameters[0]?.text === "482913", otp);
  check("whatsapp: number sent without +", otp.to === "919876543210");
  const plain = toMetaPayload("+919876543210", { type: "template", templateName: "availability_check", bodyParameters: ["x"] }) as { template: { components: { type: string }[] } };
  check("whatsapp: other templates have no button component", plain.template.components.every((c) => c.type !== "button"));
  const { checkProductionEnv } = await import("../src/lib/env-check");
  const bad = checkProductionEnv({});
  check("env check: missing DATABASE_URL/SESSION_SECRET are errors", bad.errors.length === 2);
  const good = checkProductionEnv({ DATABASE_URL: "x", SESSION_SECRET: "s".repeat(48), CRON_SECRET: "c".repeat(32), TRUSTED_IP_HEADER: "x-real-ip", NEXT_PUBLIC_SITE_URL: "https://x", ADMIN_REQUIRE_MFA: "true" });
  check("env check: good config passes cleanly", good.errors.length === 0 && good.warnings.length === 0, good);
  check("env check: DEMO_MODE is flagged", checkProductionEnv({ DATABASE_URL: "x", SESSION_SECRET: "s".repeat(48), DEMO_MODE: "true" }).warnings.some((w) => w.includes("DEMO_MODE")));
  check("env check never echoes values", !JSON.stringify(checkProductionEnv({ DATABASE_URL: "postgres://secret-value", SESSION_SECRET: "short" })).includes("secret-value"));

  const { cleanDescription } = await import("../src/server/reports/submit");
  check("report text: control + bidi characters removed", cleanDescription("a\u0000b‮c​d") === "abcd");
  check("report text: HTML kept as inert text", cleanDescription("<script>alert(1)</script>") === "<script>alert(1)</script>");

  const { isMetaMediaUrl } = await import("../src/server/whatsapp/client");
  check("meta media: lookaside allowed", isMetaMediaUrl("https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1"));
  for (const u of ["http://lookaside.fbsbx.com/x", "https://evil.com/fbsbx.com", "https://fbsbx.com.evil.com/x", "https://169.254.169.254/latest/meta-data", "file:///etc/passwd"]) {
    check(`meta media: blocked ${u}`, !isMetaMediaUrl(u));
  }

  // ── Upload validation (content, not names) ──
  const { processImage, UnsupportedImageError } = await import("../src/server/storage");
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
  check("upload: SVG refused by content", await processImage(svg).then(() => false, (e) => e instanceof UnsupportedImageError));
  check("upload: text pretending to be JPEG refused", await processImage(Buffer.from("not really a jpeg")).then(() => false, (e) => e instanceof UnsupportedImageError));
  const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#0a0" } }).gif().toBuffer();
  check("upload: GIF refused by content", await processImage(gif).then(() => false, (e) => e instanceof UnsupportedImageError));
  const bomb = await sharp({ create: { width: 8000, height: 8000, channels: 3, background: "#000" } }).png({ compressionLevel: 9 }).toBuffer();
  check(`upload: 64 MP image (${Math.round(bomb.length / 1024)} KB) refused`, await rejects(() => processImage(bomb)));
  const photo = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#3a7" } })
    .withMetadata({ exif: { IFD0: { Copyright: "secret-gps-home" } } })
    .jpeg()
    .toBuffer();
  const out = await processImage(photo);
  const meta = await sharp(out.data).metadata();
  check("upload: re-encoded to WebP ≤ 1600px", meta.format === "webp" && out.width === 1600 && out.height <= 1600, { format: meta.format, w: out.width });
  check("upload: EXIF stripped", !meta.exif && !out.data.includes(Buffer.from("secret-gps-home")));

  // ── Webhook signature + cron auth (route handlers called directly) ──
  const webhook = await import("../src/app/api/whatsapp/webhook/route");
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  const sig = "sha256=" + createHmac("sha256", process.env.WHATSAPP_APP_SECRET!).update(body).digest("hex");
  const post = (headers: Record<string, string>) => webhook.POST(new Request("http://x/api/whatsapp/webhook", { method: "POST", body, headers }));
  check("webhook: missing signature → 401", (await post({})).status === 401);
  check("webhook: wrong signature → 401", (await post({ "x-hub-signature-256": "sha256=" + "0".repeat(64) })).status === 401);
  check("webhook: signature over a different body → 401", (await webhook.POST(new Request("http://x", { method: "POST", body: body + " ", headers: { "x-hub-signature-256": sig } }))).status === 401);
  check("webhook: valid signature → 200", (await post({ "x-hub-signature-256": sig })).status === 200);
  const cron = await import("../src/app/api/cron/availability/route");
  check("cron: no token → 401", (await cron.GET(new Request("http://x/api/cron/availability"))).status === 401);
  check("cron: wrong token → 401", (await cron.GET(new Request("http://x", { headers: { authorization: "Bearer nope" } }))).status === 401);
}

async function database() {
  const { hitRateLimit, LIMITS } = await import("../src/lib/rate-limit");
  const subject = `check-${Date.now()}`;
  const { limit, windowSeconds } = LIMITS.noCodeSignInPerSeller;
  const t0 = Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000 + 1000;
  const results = [];
  for (let i = 0; i < limit + 1; i++) results.push(await hitRateLimit("noCodeSignInPerSeller", subject, t0));
  check(`rate limit: first ${limit} allowed`, results.slice(0, limit).every((r) => r.ok));
  const last = results[limit];
  check("rate limit: next one blocked with Retry-After", !last.ok && last.retryAfterSeconds > 0 && last.retryAfterSeconds <= windowSeconds, last);
  check("rate limit: resets in the next window", (await hitRateLimit("noCodeSignInPerSeller", subject, t0 + windowSeconds * 1000)).ok);
  const parallel = await Promise.all(Array.from({ length: 20 }, () => hitRateLimit("noCodeSignInPerSeller", `${subject}-p`, t0)));
  check("rate limit: exact under concurrency (shared counter)", parallel.filter((r) => r.ok).length === limit, parallel.filter((r) => r.ok).length);
  await db.rateLimitBucket.deleteMany({ where: { key: { contains: subject } } });

  // ── Fixtures ──
  const city = await db.city.findFirstOrThrow({ where: { isLive: true } });
  const stamp = Date.now().toString(36).toUpperCase().replace(/[^2-9A-HJ-KMNP-Z]/g, "X").slice(-6).padStart(6, "Z");
  const mkSeller = (n: number, extra: object = {}) =>
    db.seller.create({ data: { code: `SLR-${stamp.slice(0, 5)}${n}`, profileSlug: `check-sec-${stamp.toLowerCase()}-${n}`, name: `Check Seller ${n}`, phone: `+9197${String(Date.now()).slice(-7)}${n}`, onboardedAt: new Date(), ...extra } });
  const sellerA = await mkSeller(2);
  const sellerB = await mkSeller(3);
  const blocked = await mkSeller(4, { isBlocked: true });
  const mkPlot = (i: number, sellerId: string, status: "ACTIVE" | "PENDING" | "HIDDEN" | "SOLD", hiddenReason: "BY_ADMIN" | "BY_SELLER" | "AVAILABILITY_UNCONFIRMED" | null = null) =>
    db.property.create({
      data: {
        code: `P-S${stamp.slice(0, 3)}${i}`.slice(0, 9),
        slug: `check-sec-${stamp.toLowerCase()}-${i}`,
        sellerId,
        cityId: city.id,
        title: `Check plot ${i}`,
        description: "Temporary plot created by scripts/check-security.ts",
        landType: "AGRICULTURAL",
        locality: "Test",
        area: 1,
        areaUnit: "ACRE",
        areaSqft: 43560,
        price: BigInt(1_000_000),
        status,
        hiddenReason,
        publishedAt: status === "PENDING" ? null : new Date(),
      },
    });
  const live = await mkPlot(1, sellerA.id, "ACTIVE");
  const pending = await mkPlot(2, sellerA.id, "PENDING");
  const hiddenByAdmin = await mkPlot(3, sellerA.id, "HIDDEN", "BY_ADMIN");
  const sold = await mkPlot(4, sellerA.id, "SOLD");
  const blockedPlot = await mkPlot(5, blocked.id, "ACTIVE");
  const admin = await db.adminUser.create({ data: { email: `check-sec-${stamp.toLowerCase()}@plots.test`, name: "Check Admin", passwordHash: "x:y" } });

  const { submitReport } = await import("../src/server/reports/submit");
  const { LISTING_REASONS, PROFILE_REASONS } = await import("../src/lib/reports");
  let n = 0;
  const anon = () => ({ sellerId: null, browserToken: `anon-browser-token-${stamp}-${++n}`, ip: `203.0.113.${n % 250}` });

  try {
    // Every reason, both targets
    for (const r of LISTING_REASONS) {
      const res = await submitReport({ target: "LISTING", ref: live.id, reason: r.code, description: r.code === "OTHER" ? "Something else is wrong here" : undefined }, anon());
      check(`listing report: ${r.code}`, res.ok && !res.alreadyReported, res);
    }
    for (const r of PROFILE_REASONS) {
      const res = await submitReport({ target: "PROFILE", ref: sellerA.profileSlug!, reason: r.code, description: r.code === "OTHER" ? "Something else is wrong here" : undefined }, anon());
      check(`profile report: ${r.code}`, res.ok && !res.alreadyReported, res);
    }
    const stored = await db.report.findMany({ where: { sellerId: sellerA.id } });
    check("reports stored against the right seller (server-derived)", stored.length === LISTING_REASONS.length + PROFILE_REASONS.length && stored.every((x) => x.sellerId === sellerA.id));
    check("listing reports linked to the plot; profile reports not", stored.filter((x) => x.target === "LISTING").every((x) => x.propertyId === live.id) && stored.filter((x) => x.target === "PROFILE").every((x) => x.propertyId === null));
    check("fraud reports are prioritised", stored.filter((x) => x.reason === "FRAUD").every((x) => x.priority) && stored.filter((x) => x.reason !== "FRAUD").every((x) => !x.priority));
    check("no raw IP or browser token stored", !JSON.stringify(stored).includes("203.0.113.") && !JSON.stringify(stored).includes("anon-browser-token"));

    // Validation
    check("OTHER without description rejected", (await submitReport({ target: "LISTING", ref: live.id, reason: "OTHER" }, anon())).ok === false);
    check("OTHER with 3 chars rejected", (await submitReport({ target: "LISTING", ref: live.id, reason: "OTHER", description: "bad" }, anon())).ok === false);
    check("profile-only reason on a listing rejected", (await submitReport({ target: "LISTING", ref: live.id, reason: "FAKE_PROFILE" }, anon())).ok === false);
    check("listing-only reason on a profile rejected", (await submitReport({ target: "PROFILE", ref: sellerA.profileSlug, reason: "WRONG_LOCATION" }, anon())).ok === false);
    check("unknown reason rejected", (await submitReport({ target: "LISTING", ref: live.id, reason: "DROP TABLE" }, anon())).ok === false);
    check("unknown target type rejected", (await submitReport({ target: "SELLER", ref: live.id, reason: "FRAUD" }, anon())).ok === false);
    check("over-long description rejected", (await submitReport({ target: "LISTING", ref: live.id, reason: "FRAUD", description: "x".repeat(1001) }, anon())).ok === false);
    check("nonexistent plot rejected", (await submitReport({ target: "LISTING", ref: "doesnotexist123", reason: "FRAUD" }, anon())).ok === false);
    check("nonexistent profile rejected", (await submitReport({ target: "PROFILE", ref: "nobody-zzzzzz", reason: "FRAUD" }, anon())).ok === false);
    check("malformed ref rejected", (await submitReport({ target: "LISTING", ref: "'; DROP TABLE reports;--", reason: "FRAUD" }, anon())).ok === false);
    check("unpublished (pending) plot can't be reported", (await submitReport({ target: "LISTING", ref: pending.id, reason: "FRAUD" }, anon())).ok === false);
    check("plot hidden by admin can't be reported", (await submitReport({ target: "LISTING", ref: hiddenByAdmin.id, reason: "FRAUD" }, anon())).ok === false);
    check("blocked seller's plot can't be reported", (await submitReport({ target: "LISTING", ref: blockedPlot.id, reason: "FRAUD" }, anon())).ok === false);
    check("blocked seller's profile can't be reported", (await submitReport({ target: "PROFILE", ref: blocked.profileSlug, reason: "FRAUD" }, anon())).ok === false);
    check("sold plot can still be reported (e.g. fraud)", (await submitReport({ target: "LISTING", ref: sold.id, reason: "FRAUD" }, anon())).ok === true);
    check("missing reporter identity rejected", (await submitReport({ target: "LISTING", ref: live.id, reason: "FRAUD" }, { sellerId: null, browserToken: null, ip: null })).ok === false);

    // Signed-in reporter, separation, self-report
    const asB = { sellerId: sellerB.id, browserToken: null, ip: null };
    const byB = await submitReport({ target: "LISTING", ref: live.id, reason: "INCORRECT_INFO", description: "Price is wrong" }, asB);
    const rowB = byB.ok ? await db.report.findUnique({ where: { code: byB.code } }) : null;
    check("signed-in reporter recorded", rowB?.reporterSellerId === sellerB.id);
    check("reporter ≠ reported seller", rowB?.sellerId === sellerA.id && rowB?.reporterSellerId === sellerB.id);
    check("seller can't report own plot", (await submitReport({ target: "LISTING", ref: live.id, reason: "FRAUD" }, { sellerId: sellerA.id, browserToken: null, ip: null })).ok === false);
    check("seller can't report own profile", (await submitReport({ target: "PROFILE", ref: sellerA.profileSlug, reason: "FRAUD" }, { sellerId: sellerA.id, browserToken: null, ip: null })).ok === false);

    // Duplicates and races
    const again = await submitReport({ target: "LISTING", ref: live.id, reason: "DUPLICATE_LISTING" }, asB);
    check("second report on same plot by same reporter → same report", again.ok && again.alreadyReported && byB.ok && again.code === byB.code, again);
    const racer = { sellerId: null, browserToken: `racer-${stamp}`, ip: "198.51.100.7" };
    const race = await Promise.all(Array.from({ length: 6 }, () => submitReport({ target: "PROFILE", ref: sellerB.profileSlug, reason: "FRAUD" }, racer)));
    const raceRows = await db.report.count({ where: { sellerId: sellerB.id, target: "PROFILE" } });
    check("6 simultaneous taps → 1 report", race.every((r) => r.ok) && raceRows === 1, { raceRows, race });

    // Rate limit per reporter (10/day). Same reporter, same target → deduped, never counted twice.
    const heavy = { sellerId: null, browserToken: `heavy-${stamp}`, ip: null };
    const heavyResults = [];
    for (const reason of ["FRAUD", "INCORRECT_INFO", "WRONG_LOCATION", "DUPLICATE_LISTING", "PROPERTY_SOLD"]) {
      heavyResults.push(await submitReport({ target: "LISTING", ref: live.id, reason }, heavy)); // deduped → doesn't count
    }
    check("dedupe: one open report per reporter per target", heavyResults.filter((r) => r.ok && !r.alreadyReported).length === 1);
    const { hitRateLimit: hit } = await import("../src/lib/rate-limit");
    const { keyedHash } = await import("../src/lib/keyed-hash");
    const capKey = keyedHash("reporter", `anon:cap-${stamp}`);
    for (let i = 0; i < 10; i++) await hit("reportPerReporter", capKey);
    const capped = await submitReport({ target: "PROFILE", ref: sellerB.profileSlug, reason: "ABUSIVE" }, { sellerId: null, browserToken: `cap-${stamp}`, ip: null });
    check("rate limit: 11th report from one reporter in a day blocked", !capped.ok && Boolean(capped.retryAfterSeconds), capped);

    // Injection payloads stored verbatim as data
    const xss = '<img src=x onerror=alert(1)> "); DROP TABLE reports;--';
    const inj = await submitReport({ target: "LISTING", ref: sold.id, reason: "OTHER", description: xss }, anon());
    const injRow = inj.ok ? await db.report.findUnique({ where: { code: inj.code } }) : null;
    check("payloads stored as inert text", injRow?.description === xss.trim());
    check("reports table still there", (await db.report.count()) > 0);

    // ── Moderation workflow + audit ──
    const { changeReportStatus, addReportNote } = await import("../src/server/reports/moderation");
    const target = await db.report.findFirstOrThrow({ where: { sellerId: sellerA.id, reason: "PROPERTY_SOLD" } });
    const actor = { id: admin.id, email: admin.email };
    check("resolve needs an outcome", !(await changeReportStatus(actor, target.id, { status: "RESOLVED" } as never)).ok);
    check("dismiss needs a reason", !(await changeReportStatus(actor, target.id, { status: "DISMISSED", note: "" })).ok);
    check("start review", (await changeReportStatus(actor, target.id, { status: "UNDER_REVIEW" })).ok);
    const reviewing = await db.report.findUniqueOrThrow({ where: { id: target.id } });
    check("under review + assigned to the admin", reviewing.status === "UNDER_REVIEW" && reviewing.assignedAdminId === admin.id);
    check("note added", (await addReportNote(actor, target.id, "Called the seller, waiting")).ok);
    check("empty note refused", !(await addReportNote(actor, target.id, " ")).ok);
    const openOnPlotBefore = await db.report.count({ where: { propertyId: live.id, status: { in: ["PENDING", "UNDER_REVIEW"] } } });
    const resolved = await changeReportStatus(actor, target.id, { status: "RESOLVED", outcome: "SELLER_CONTACTED", note: "Still available per seller", includeRelated: true });
    check("resolve with related", resolved.ok, resolved);
    const after = await db.report.findUniqueOrThrow({ where: { id: target.id } });
    check("resolved report: outcome, reviewedAt, dedupe released", after.status === "RESOLVED" && after.outcome === "SELLER_CONTACTED" && after.reviewedAt !== null && after.dedupeKey === null);
    check("related open reports on the plot closed too", openOnPlotBefore > 1 && (await db.report.count({ where: { propertyId: live.id, status: { in: ["PENDING", "UNDER_REVIEW"] } } })) === 0);
    check("profile reports untouched by plot resolution", (await db.report.count({ where: { sellerId: sellerA.id, target: "PROFILE", status: "PENDING" } })) > 0);
    const plotNow = await db.property.findUniqueOrThrow({ where: { id: live.id } });
    check("'Property sold' report never changes the plot by itself", plotNow.status === "ACTIVE");
    check("same status twice is refused", !(await changeReportStatus(actor, target.id, { status: "RESOLVED", outcome: "NO_ACTION" })).ok);
    check("reopen", (await changeReportStatus(actor, target.id, { status: "UNDER_REVIEW" })).ok && (await db.report.findUniqueOrThrow({ where: { id: target.id } })).outcome === null);
    const logs = await db.auditLog.findMany({ where: { reportId: target.id }, orderBy: { createdAt: "asc" } });
    check("audit log: review, note, resolve, reopen recorded with admin", ["report.UNDER_REVIEW", "report.note", "report.RESOLVED", "report.UNDER_REVIEW"].every((a, i) => logs[i]?.action === a) && logs.every((l) => l.adminUserId === admin.id && l.actorLabel === admin.email), logs.map((l) => l.action));
    check("unknown report id refused", !(await changeReportStatus(actor, "nope", { status: "UNDER_REVIEW" })).ok);
    const { recordAudit } = await import("../src/server/audit");
    const pendingOne = await db.report.findFirstOrThrow({ where: { sellerId: sellerA.id, target: "PROFILE", status: "PENDING" } });
    await recordAudit(actor, { action: "listing.AVAILABILITY_CHECK", targetType: "listing", targetId: live.id, propertyId: live.id, sellerId: sellerA.id, reportId: pendingOne.id, note: "asked seller" });
    check("acting from a report moves it to under review", (await db.report.findUniqueOrThrow({ where: { id: pendingOne.id } })).status === "UNDER_REVIEW");

    // ── Evidence survives deletes ──
    check("plot with reports can't be deleted (RESTRICT)", await rejects(() => db.property.delete({ where: { id: live.id } })));
    check("seller with reports can't be deleted (RESTRICT)", await rejects(() => db.seller.delete({ where: { id: sellerA.id } })));

    // ── Admin filters, counts, pagination ──
    const { listReports, parseReportFilters, reportCounts } = await import("../src/server/admin/reports");
    const all = await listReports(parseReportFilters({ seller: sellerA.id }));
    check("filter by seller", all.total === (await db.report.count({ where: { sellerId: sellerA.id } })) && all.items.every((r) => r.seller.id === sellerA.id));
    check("filter by listing", (await listReports(parseReportFilters({ listing: live.id }))).items.every((r) => r.property?.id === live.id));
    check("filter by type + reason", (await listReports(parseReportFilters({ seller: sellerA.id, type: "PROFILE", reason: "FRAUD" }))).total === 1);
    check("filter by status", (await listReports(parseReportFilters({ seller: sellerA.id, status: "RESOLVED" }))).items.every((r) => r.status === "RESOLVED"));
    check("search by plot code", (await listReports(parseReportFilters({ q: live.code }))).items.some((r) => r.property?.id === live.id));
    check("search by reporter seller code", (await listReports(parseReportFilters({ q: sellerB.code }))).items.some((r) => r.reporterSeller?.id === sellerB.id));
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    check("date filter (future) → nothing", (await listReports(parseReportFilters({ seller: sellerA.id, from: tomorrow }))).total === 0);
    check("hostile filter values ignored", JSON.stringify(parseReportFilters({ status: "__proto__", type: "x", reason: "constructor", seller: "'; --", page: "-5" })) === JSON.stringify({ page: 1 }));
    const counts = await reportCounts();
    const real = await db.report.groupBy({ by: ["status"], _count: { _all: true } });
    check("counts match the database", real.every((g) => counts[g.status] === g._count._all));
    const many = await listReports({ ...parseReportFilters({ seller: sellerA.id }), page: 1 });
    check("pagination capped at page size", many.items.length <= 20);
    check("list exposes no reporter hashes beyond the key, no phones", !JSON.stringify(many.items, (_k, v) => (typeof v === "bigint" ? String(v) : v)).match(/\+91\d{10}|reporterIpHash/));
  } finally {
    const sellers = [sellerA.id, sellerB.id, blocked.id];
    await db.auditLog.deleteMany({ where: { OR: [{ adminUserId: admin.id }, { sellerId: { in: sellers } }] } });
    await db.report.deleteMany({ where: { OR: [{ sellerId: { in: sellers } }, { reporterSellerId: { in: sellers } }] } });
    await db.property.deleteMany({ where: { slug: { startsWith: `check-sec-${stamp.toLowerCase()}-` } } });
    await db.seller.deleteMany({ where: { id: { in: sellers } } });
    await db.adminUser.delete({ where: { id: admin.id } });
    await db.rateLimitBucket.deleteMany({ where: { OR: [{ key: { startsWith: "reportPer" } }, { key: { contains: stamp } }] } });
  }
}

pure()
  .then(database)
  .catch((e) => {
    failed++;
    console.error(e);
  })
  .finally(async () => {
    await db.$disconnect();
    console.log(`${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  });
