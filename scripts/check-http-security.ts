/**
 * End-to-end security checks over HTTP against a running PRODUCTION build.
 *
 *   pnpm build
 *   TRUSTED_IP_HEADER=x-test-client-ip pnpm exec next start -p 3100
 *   BASE_URL=http://localhost:3100 pnpm check:http
 *
 * (The test server trusts x-test-client-ip so per-IP limits can be exercised;
 * never set a client-controlled header as TRUSTED_IP_HEADER in production.)
 *
 * Covers: security headers, admin/seller authorization (pages and Server
 * Actions, incl. forged cross-origin calls), cross-seller access (BOLA),
 * uploads, rate limits + header spoofing, reporting end-to-end, reporter
 * privacy, stored-XSS rendering, admin two-step sign-in.
 */
import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { encryptMfaSecret, generateMfaSecret, totpAt, currentStep } from "../src/lib/admin/mfa";
import { hashSecret } from "../src/lib/scrypt-hash";

const BASE = (process.env.BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const ORIGIN = new URL(BASE).origin;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`✗ ${name}`, detail ?? "");
  }
}

// ── Server Action ids from the build manifest ──
const manifest = JSON.parse(fs.readFileSync(path.join(".next/server/server-reference-manifest.json"), "utf8")) as {
  node: Record<string, { filename: string; exportedName: string }>;
};
function actionId(file: string, name: string): string {
  const hit = Object.entries(manifest.node).find(([, v]) => v.filename === file && v.exportedName === name);
  if (!hit) throw new Error(`Server Action ${file}#${name} not found in the build — run pnpm build first.`);
  return hit[0];
}

type Res = { status: number; text: string; headers: Headers };
async function get(p: string, cookie = "", headers: Record<string, string> = {}): Promise<Res> {
  const r = await fetch(BASE + p, { redirect: "manual", headers: { cookie, ...headers } });
  return { status: r.status, text: await r.text(), headers: r.headers };
}
async function callAction(page: string, file: string, name: string, args: unknown[], cookie = "", headers: Record<string, string> = {}): Promise<Res> {
  const r = await fetch(BASE + page, {
    method: "POST",
    redirect: "manual",
    headers: { "Next-Action": actionId(file, name), "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", Origin: ORIGIN, cookie, ...headers },
    body: JSON.stringify(args),
  });
  return { status: r.status, text: await r.text(), headers: r.headers };
}
const okPayload = (r: Res) => /"ok":true/.test(r.text);

async function main() {
  // ── Fixtures ──
  const stamp = randomBytes(4).toString("hex");
  const city = await db.city.findFirstOrThrow({ where: { isLive: true } });
  const token = () => randomBytes(32).toString("base64url");
  const sha = (t: string) => createHash("sha256").update(t).digest("hex");
  const mkSeller = async (n: number) => {
    const s = await db.seller.create({
      data: { code: `SLR-H${stamp.slice(0, 4).toUpperCase().replace(/[01ILO]/g, "X")}${n}`, profileSlug: `check-http-${stamp}-${n}`, name: `Http Seller ${n}`, phone: `+9198${String(Date.now()).slice(-7)}${n}`, onboardedAt: new Date(), phoneVerifiedAt: new Date() },
    });
    const t = token();
    await db.sellerSession.create({ data: { sellerId: s.id, tokenHash: sha(t), expiresAt: new Date(Date.now() + 3_600_000) } });
    return { ...s, cookie: `plots_seller_session=${t}` };
  };
  const A = await mkSeller(1);
  const B = await mkSeller(2);
  const mkPlot = (i: number, sellerId: string, status: "ACTIVE" | "HIDDEN" = "ACTIVE", hiddenReason: "BY_SELLER" | null = null) =>
    db.property.create({
      data: {
        code: `P-H${stamp.slice(0, 4).toUpperCase()}${i}`.slice(0, 9),
        slug: `check-http-${stamp}-${i}`,
        sellerId,
        cityId: city.id,
        title: `Http check plot ${i} ${stamp}`,
        description: "Temporary plot created by scripts/check-http-security.ts",
        landType: "AGRICULTURAL",
        locality: "Test",
        area: 1,
        areaUnit: "ACRE",
        areaSqft: 43560,
        price: BigInt(1_000_000),
        status,
        hiddenReason,
        publishedAt: new Date(),
      },
    });
  const plotA = await mkPlot(1, A.id);
  const plotB = await mkPlot(2, B.id);
  const hiddenA = await mkPlot(3, A.id, "HIDDEN", "BY_SELLER");
  const adminPassword = `pw-${stamp}-long-enough`;
  const admin = await db.adminUser.create({ data: { email: `check-http-${stamp}@plots.test`, name: "Http Admin", passwordHash: await hashSecret(adminPassword) } });
  const adminToken = token();
  await db.adminSession.create({ data: { adminUserId: admin.id, tokenHash: sha(adminToken), expiresAt: new Date(Date.now() + 3_600_000) } });
  const adminCookie = `plots_admin_session=${adminToken}`;
  const mfaSecret = generateMfaSecret();
  const mfaAdmin = await db.adminUser.create({
    data: { email: `check-http-mfa-${stamp}@plots.test`, name: "Mfa Admin", passwordHash: await hashSecret(adminPassword), mfaSecret: encryptMfaSecret(mfaSecret), mfaEnabledAt: new Date() },
  });
  const uploaded: string[] = [];

  try {
    // ── Headers ──
    const home = await get("/");
    const csp = home.headers.get("content-security-policy") ?? "";
    check("CSP present with frame-ancestors/object-src/base-uri", /frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp) && /base-uri 'self'/.test(csp), csp);
    check("CSP has no unsafe-eval in production", !csp.includes("unsafe-eval"));
    check("X-Frame-Options DENY", home.headers.get("x-frame-options") === "DENY");
    check("nosniff", home.headers.get("x-content-type-options") === "nosniff");
    check("Referrer-Policy", home.headers.get("referrer-policy") === "strict-origin-when-cross-origin");
    check("Permissions-Policy", (home.headers.get("permissions-policy") ?? "").includes("camera=()"));
    check("no X-Powered-By", !home.headers.has("x-powered-by"));
    const dash = await get("/seller/dashboard", A.cookie);
    check("signed-in pages not publicly cacheable", /private|no-store/.test(dash.headers.get("cache-control") ?? ""), dash.headers.get("cache-control"));

    // ── Admin authorization (pages) ──
    const anonAdmin = await get("/admin/reports");
    check("admin: anonymous → login", anonAdmin.status === 307 && (anonAdmin.headers.get("location") ?? "").includes("/admin/login"));
    const sellerAdmin = await get("/admin/reports", A.cookie);
    check("admin: seller session → login", sellerAdmin.status === 307 && (sellerAdmin.headers.get("location") ?? "").includes("/admin/login"));
    check("admin: forged cookie → login", (await get("/admin", "plots_admin_session=forged-token")).status === 307);
    check("admin: real admin → 200", (await get("/admin/reports", adminCookie)).status === 200);

    // ── Cross-seller access (BOLA) ──
    const editOther = await get(`/seller/plots/${plotB.id}/edit`, A.cookie);
    check("seller A can't open seller B's edit page", editOther.status === 404 && !editOther.text.includes(plotB.title), editOther.status);
    check("seller A can open own edit page", (await get(`/seller/plots/${plotA.id}/edit`, A.cookie)).status === 200);
    check("seller dashboard shows only own plots", dash.text.includes(plotA.title) && !dash.text.includes(plotB.title));
    const actionOnOther = await callAction("/seller/dashboard", "src/server/actions/seller/listings.ts", "sellerListingAction", [plotB.id, "MARK_SOLD"], A.cookie);
    check("seller A can't mark seller B's plot sold (Server Action)", (await db.property.findUniqueOrThrow({ where: { id: plotB.id } })).status === "ACTIVE" && !okPayload(actionOnOther), actionOnOther.text.slice(0, 200));
    check("hidden-by-seller plot page → 404", (await get(`/property/${hiddenA.slug}`)).status === 404);

    // ── Uploads ──
    const jpg = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#3a7" } }).jpeg().toBuffer();
    const upload = async (bytes: Buffer, type: string, name: string, cookie: string, origin = ORIGIN) => {
      const fd = new FormData();
      fd.set("file", new File([new Uint8Array(bytes)], name, { type }));
      const r = await fetch(`${BASE}/api/uploads`, { method: "POST", body: fd, headers: { cookie, Origin: origin } });
      return { status: r.status, body: (await r.json().catch(() => ({}))) as { url?: string } };
    };
    check("upload: anonymous → 401", (await upload(jpg, "image/jpeg", "a.jpg", "")).status === 401);
    check("upload: cross-origin → 403", (await upload(jpg, "image/jpeg", "a.jpg", A.cookie, "https://evil.example")).status === 403);
    check("upload: SVG → 415", (await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "image/svg+xml", "a.svg", A.cookie)).status === 415);
    check("upload: SVG renamed .jpg → 415", (await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), "image/jpeg", "a.jpg", A.cookie)).status === 415);
    check("upload: HTML renamed .png → 415", (await upload(Buffer.from("<html><script>alert(1)</script></html>"), "image/png", "x.png", A.cookie)).status === 415);
    const good = await upload(jpg, "image/jpeg", "../../etc/passwd.jpg", A.cookie);
    check("upload: real photo → 201, server-chosen name", good.status === 201 && /^\/media\/\d{4}\/\d{2}\/[\w-]+\.webp$/.test(good.body.url ?? ""), good);
    if (good.body.url) {
      uploaded.push(good.body.url);
      const media = await get(good.body.url);
      check("media served as image/webp + nosniff", media.headers.get("content-type") === "image/webp" && media.headers.get("x-content-type-options") === "nosniff");
    }
    check("media: path traversal → 404", (await get("/media/..%2F..%2Fpackage.json")).status === 404);

    // ── Rate limits (trusted header) + spoofing ──
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    const enquire = (xff: string) =>
      fetch(`${BASE}/api/enquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-test-client-ip": ip, "x-forwarded-for": xff, "x-real-ip": xff },
        body: JSON.stringify({ propertyId: plotA.id, name: "Rate Test", phone: `98${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`, channel: "WHATSAPP" }),
      });
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await enquire(`10.0.0.${i}`)).status);
    check("enquiries: 20 per IP allowed, 21st → 429 (X-Forwarded-For ignored)", statuses.slice(0, 20).every((s) => s === 200) && statuses[20] === 429, statuses);
    const limited = await enquire("10.9.9.9");
    check("429 carries Retry-After", limited.status === 429 && Number(limited.headers.get("retry-after")) > 0);
    check("events: bad payload → 400", (await fetch(`${BASE}/api/events`, { method: "POST", body: "{nope" })).status === 400);
    check("cron without secret → 401", (await get("/api/cron/availability")).status === 401);

    // ── Reporting end-to-end ──
    const xss = `<img src=x onerror=alert(1)> ${stamp}`;
    const rep = await callAction(`/property/${plotA.slug}`, "src/server/actions/report.ts", "reportAction", [{ target: "LISTING", ref: plotA.id, reason: "OTHER", description: xss }], "", { "x-test-client-ip": "192.0.2.10" });
    const setCookie = rep.headers.get("set-cookie") ?? "";
    check("anonymous report accepted", okPayload(rep), rep.text.slice(0, 300));
    check("anonymous reporter cookie is HttpOnly", /plots_reporter=/.test(setCookie) && /HttpOnly/i.test(setCookie), setCookie);
    const reporterCookie = setCookie.split(";")[0];
    const dup = await callAction(`/property/${plotA.slug}`, "src/server/actions/report.ts", "reportAction", [{ target: "LISTING", ref: plotA.id, reason: "FRAUD" }], reporterCookie, { "x-test-client-ip": "192.0.2.10" });
    check("repeat report from same browser → same report", /"alreadyReported":true/.test(dup.text));
    check("one report stored", (await db.report.count({ where: { propertyId: plotA.id } })) === 1);
    const forged = await callAction(`/property/${plotA.slug}`, "src/server/actions/report.ts", "reportAction", [{ target: "LISTING", ref: plotB.id, reason: "FRAUD", sellerId: A.id }], "", { "x-test-client-ip": "192.0.2.11" });
    const forgedRow = await db.report.findFirst({ where: { propertyId: plotB.id } });
    check("client-supplied sellerId ignored (server derives the seller)", okPayload(forged) && forgedRow?.sellerId === B.id);
    const crossOrigin = await callAction(`/property/${plotA.slug}`, "src/server/actions/report.ts", "reportAction", [{ target: "PROFILE", ref: A.profileSlug, reason: "FRAUD" }], "", { Origin: "https://evil.example", "x-test-client-ip": "192.0.2.12" });
    check("cross-origin Server Action call rejected (CSRF)", !okPayload(crossOrigin) && (await db.report.count({ where: { sellerId: A.id, target: "PROFILE" } })) === 0, crossOrigin.status);
    const signedInReport = await callAction(`/s/${A.profileSlug}`, "src/server/actions/report.ts", "reportAction", [{ target: "PROFILE", ref: A.profileSlug, reason: "ABUSIVE" }], B.cookie);
    const signedRow = await db.report.findFirst({ where: { sellerId: A.id, target: "PROFILE" } });
    check("signed-in seller recorded as reporter, separate from reported seller", okPayload(signedInReport) && signedRow?.reporterSellerId === B.id && signedRow?.sellerId === A.id);

    // Privacy: public + seller pages never show reports
    const pub = await get(`/property/${plotA.slug}`);
    const has = (html: string, words: string) => new RegExp(words.split(" ").join("(?:\\s|<!-- -->)*")).test(html);
    check("public plot page has the report button", has(pub.text, "Report this listing"));
    check("public plot page never shows report contents", !pub.text.includes(stamp) || !pub.text.includes("onerror=alert"));
    const dashA = await get("/seller/dashboard", A.cookie);
    const codes = (await db.report.findMany({ where: { sellerId: A.id }, select: { code: true } })).map((r) => r.code);
    check("reported seller's dashboard shows no reports", !dashA.text.includes("onerror=alert") && codes.length > 0 && codes.every((c) => !dashA.text.includes(c)));
    const profilePage = await get(`/s/${A.profileSlug}`);
    check("public profile has the report button", has(profilePage.text, "Report this profile"));

    // Admin view: stored XSS rendered as text
    const reportRow = await db.report.findFirstOrThrow({ where: { propertyId: plotA.id } });
    const adminView = await get(`/admin/reports/${reportRow.id}`, adminCookie);
    check("admin report page 200", adminView.status === 200);
    check("stored XSS escaped in admin page", adminView.text.includes("&lt;img src=x onerror=alert(1)&gt;") && !adminView.text.includes(`<img src=x onerror=alert(1)>`));
    check("seller can't open admin report page", (await get(`/admin/reports/${reportRow.id}`, A.cookie)).status === 307);

    // Admin Server Actions: only admins, only same-origin
    const statusArgs = [reportRow.id, { status: "UNDER_REVIEW" }];
    await callAction("/admin/reports", "src/server/actions/admin/reports.ts", "setReportStatusAction", statusArgs);
    await callAction("/admin/reports", "src/server/actions/admin/reports.ts", "setReportStatusAction", statusArgs, A.cookie);
    check("report status unchanged by anonymous / seller calls", (await db.report.findUniqueOrThrow({ where: { id: reportRow.id } })).status === "PENDING");
    await callAction("/admin/reports", "src/server/actions/admin/reports.ts", "setReportStatusAction", statusArgs, adminCookie, { Origin: "https://evil.example" });
    check("report status unchanged by forged cross-origin admin call", (await db.report.findUniqueOrThrow({ where: { id: reportRow.id } })).status === "PENDING");
    const real = await callAction("/admin/reports", "src/server/actions/admin/reports.ts", "setReportStatusAction", statusArgs, adminCookie);
    check("admin can move report to under review", okPayload(real) && (await db.report.findUniqueOrThrow({ where: { id: reportRow.id } })).status === "UNDER_REVIEW", real.text.slice(0, 200));
    await callAction("/admin/listings", "src/server/actions/admin/listings.ts", "changeListingStatusAction", [plotA.id, { type: "HIDE" }, { reportId: reportRow.id }], A.cookie);
    check("seller can't call admin listing actions", (await db.property.findUniqueOrThrow({ where: { id: plotA.id } })).status === "ACTIVE");
    await callAction("/admin/sellers", "src/server/actions/admin/sellers.ts", "setSellerBlockedAction", [A.id, true], B.cookie);
    check("seller can't suspend another seller", !(await db.seller.findUniqueOrThrow({ where: { id: A.id } })).isBlocked);
    const sold = await callAction("/admin/reports", "src/server/actions/admin/listings.ts", "changeListingStatusAction", [plotA.id, { type: "MARK_SOLD" }, { reportId: reportRow.id, note: "Seller confirmed on call" }], adminCookie);
    const auditRow = await db.auditLog.findFirst({ where: { reportId: reportRow.id, action: "listing.MARK_SOLD" } });
    check("admin marks sold from a report → audit row linked to report", okPayload(sold) && auditRow?.adminUserId === admin.id && auditRow.note === "Seller confirmed on call");
    check("public page now shows sold status", (await get(`/property/${plotA.slug}`)).text.includes("This property has been sold"));

    // ── Admin two-step sign-in ──
    const login = await callAction("/admin/login", "src/server/actions/admin/auth.ts", "adminLogin", [{ email: mfaAdmin.email, password: adminPassword }]);
    const loginCookies = login.headers.getSetCookie();
    check("MFA admin: password alone gives no session", /"mfaRequired":true/.test(login.text) && !loginCookies.some((c) => c.startsWith("plots_admin_session=")), login.text.slice(0, 200));
    const pendingCookie = loginCookies.find((c) => c.startsWith("plots_admin_mfa_pending="))?.split(";")[0] ?? "";
    check("MFA pending cookie is HttpOnly + SameSite=Strict", loginCookies.some((c) => c.startsWith("plots_admin_mfa_pending=") && /HttpOnly/i.test(c) && /SameSite=Strict/i.test(c)));
    const wrong = await callAction("/admin/login", "src/server/actions/admin/auth.ts", "adminVerifyMfa", [{ code: "000000" }], pendingCookie);
    check("MFA: wrong code refused", !okPayload(wrong) && !wrong.headers.getSetCookie().some((c) => c.startsWith("plots_admin_session=")));
    const noPending = await callAction("/admin/login", "src/server/actions/admin/auth.ts", "adminVerifyMfa", [{ code: totpAt(mfaSecret, currentStep()) }]);
    check("MFA: code without the password step refused", !okPayload(noPending));
    const right = await callAction("/admin/login", "src/server/actions/admin/auth.ts", "adminVerifyMfa", [{ code: totpAt(mfaSecret, currentStep()) }], pendingCookie);
    check("MFA: right code → session", okPayload(right) && right.headers.getSetCookie().some((c) => c.startsWith("plots_admin_session=") && /HttpOnly/i.test(c)));
    const replay = await callAction("/admin/login", "src/server/actions/admin/auth.ts", "adminLogin", [{ email: mfaAdmin.email, password: adminPassword }]);
    const pending2 = replay.headers.getSetCookie().find((c) => c.startsWith("plots_admin_mfa_pending="))?.split(";")[0] ?? "";
    const reused = await callAction("/admin/login", "src/server/actions/admin/auth.ts", "adminVerifyMfa", [{ code: totpAt(mfaSecret, currentStep()) }], pending2);
    check("MFA: same code can't be used twice", !okPayload(reused));
    const badPw = await callAction("/admin/login", "src/server/actions/admin/auth.ts", "adminLogin", [{ email: mfaAdmin.email, password: "wrong-password" }]);
    check("wrong admin password refused, generic message", /Invalid email or password/.test(badPw.text));
  } finally {
    const sellers = [A.id, B.id];
    await db.auditLog.deleteMany({ where: { OR: [{ adminUserId: { in: [admin.id, mfaAdmin.id] } }, { sellerId: { in: sellers } }] } });
    await db.report.deleteMany({ where: { OR: [{ sellerId: { in: sellers } }, { reporterSellerId: { in: sellers } }] } });
    await db.enquiry.deleteMany({ where: { propertyId: { in: [plotA.id, plotB.id] } } });
    await db.property.deleteMany({ where: { slug: { startsWith: `check-http-${stamp}-` } } });
    await db.seller.deleteMany({ where: { id: { in: sellers } } });
    await db.adminUser.deleteMany({ where: { id: { in: [admin.id, mfaAdmin.id] } } });
    await db.adminLoginAttempt.deleteMany({ where: { key: { contains: stamp } } });
    for (const u of uploaded) fs.rmSync(path.join("storage/uploads", u.replace(/^\/media\//, "")), { force: true });
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
