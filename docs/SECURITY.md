# Security audit & hardening — Plots

Audit date: 9 Oct 2026 · Scope: this repository (Next.js app, Prisma schema and migrations, Vercel/Supabase configuration as referenced by the code). Hosting-provider settings that can't be read from the repository are listed under **Not verified**.

## 1. Architecture

| Area | What it actually is |
|---|---|
| App | Next.js 16 (App Router, Server Actions, Turbopack), React 19, TypeScript, Tailwind 4 |
| Hosting | Vercel (serverless, region `sin1`), daily Vercel Cron → `/api/cron/availability` |
| Database | Supabase Postgres via Prisma 7 + `@prisma/adapter-pg`; app connects through the Supabase pooler as the table owner |
| Storage | Vercel Blob (public URLs, random names) when `BLOB_READ_WRITE_TOKEN` is set, otherwise local disk served by `/media/[...key]` |
| Seller auth | Phone OTP (scrypt-hashed codes, cooldown, per-phone/IP/global caps) → opaque random session token; SHA-256 stored in `seller_sessions`; httpOnly, SameSite=Lax cookie |
| Admin auth | Email + scrypt password, rate limited per email and per IP; **new:** optional TOTP second step; same session design (`admin_sessions`) |
| Buyers | No accounts. Contact via WhatsApp/Call links; enquiries logged via `/api/enquiries` |
| Integrations | Meta WhatsApp Cloud API (webhook with HMAC signature), KYC provider interface (only a mock exists), Nominatim geocoding (fixed host) |
| Trust boundary | Browser ↔ Next.js server (all authorization is server-side); server ↔ Postgres (owner role, RLS deny-all for Supabase's public API roles) |

## 2. Findings register

| ID | Severity | Finding | Where | Status |
|---|---|---|---|---|
| C1 | **Critical** | `DEMO_MODE=true` in production shows the login code on screen for **any** Seller ID or phone number → anyone can sign in as any seller, edit or hide their plots. The same mode simulates identity checks, so "Identity verified" badges are not real. | `src/lib/demo.ts`, `server/actions/seller/{auth,signup,chat}.ts`, `server/kyc/*` | **Open — kept on by owner decision** until WhatsApp (Meta) is connected. See §10. |
| H1 | High | No security headers: no CSP, no clickjacking protection, no `nosniff`, `X-Powered-By` exposed. | `next.config.ts` | Fixed |
| H2 | High | `/api/enquiries` is public and the buyer's phone is unverified; the only cap was per buyer number, so anyone could make the server send unlimited "new buyer" WhatsApp messages to any seller (spam, messaging cost). | `app/api/enquiries/route.ts` | Fixed — per-IP and per-plot limits |
| H3 | High | Admin accounts were password-only. | admin auth | Fixed in code (TOTP two-step sign-in); **enforcement needs `ADMIN_REQUIRE_MFA=true`** after admins enrol |
| M1 | Medium | Crafted search URLs crashed `/search` with HTTP 500: `?sort=toString` / `?type=constructor` (prototype keys passed the allowlist) and `?minPrice=1e30` (bigint overflow). Unbounded `?page=`. | `server/listings/queries.ts`, `whatsapp/bot.ts` | Fixed (`Object.hasOwn`, clamps); regression-tested |
| M2 | Medium | Seller lookup ("not found" vs "code sent"), the no-code sign-in and OTP verification across many numbers had no per-IP limits → Seller ID / phone enumeration and guessing. | `server/actions/seller/auth.ts`, `server/seller/otp.ts` | Fixed |
| M3 | Medium | Sign-up returned the registered seller's **name** for any phone number before the OTP was checked. | `server/actions/seller/signup.ts` | Fixed |
| M4 | Medium | Uploads: no per-account limit (storage cost); the decoder accepted any format sharp reads (SVG, GIF, TIFF…) when the browser lied about the type; no pixel cap (decompression bombs up to sharp's 268 MP default). | `app/api/uploads/route.ts`, `server/storage.ts` | Fixed — content-sniffed allowlist (JPEG/PNG/WebP/HEIC), 50 MP cap, 60/h + 300/day per account, always re-encoded to WebP without metadata |
| M5 | Medium | Plots hidden by the seller or by an admin, and plots of blocked sellers, stayed publicly viewable at their URL. | `app/(site)/property/[slug]/page.tsx` | Fixed (`lib/listing-visibility.ts`) |
| M6 | Medium | With `DEMO_MODE`, production logs contained OTP codes and full outbound WhatsApp messages (incl. buyer numbers). | `server/otp/provider.ts`, `server/whatsapp/client.ts` | Fixed — production logs carry only label + masked number |
| M7 | Medium | Vulnerable transitive dependencies: `mysql2` (high + moderate) and `deepmerge-ts` (high) via the Prisma CLI. | `package.json` | Fixed via `pnpm.overrides`; Prisma CLI re-verified |
| L1 | Low | WhatsApp media download sent the bearer token to whatever URL Meta's JSON returned, with no timeout or size cap. | `server/whatsapp/client.ts` | Fixed — Meta-host allowlist on every redirect hop, timeouts, 16 MB cap |
| L2 | Low | View counter and analytics beacon accepted unlimited requests (inflatable numbers, write amplification). | `app/api/properties/[id]/view`, `app/api/events` | Fixed |
| L3 | Low | Signing in again didn't invalidate the browser's previous session token. | `lib/{seller,admin}/session.ts` | Fixed (rotation) |
| L4 | Low | `create-admin` accepted 8-character passwords. | `prisma/create-admin.ts` | Fixed (12+) |
| L5 | Low | No startup check for missing/weak secrets. | — | Fixed (`src/instrumentation.ts`, `lib/env-check.ts`) |
| L6 | Low | No CI: no automated tests, dependency audit, secret scan or SAST. | — | Fixed (`.github/workflows/*`, Dependabot) |
| L7 | Low | Plot pages re-rendered on every request (no ISR) — needless DB load and latency. | property page | Fixed (see §6) |

**Checked and found sound (informational)**

- **SQL injection** — every query uses the Prisma query API or `$queryRaw` tagged templates (parameterized). No string-built SQL. Sort/filter fields are allowlisted. Regression tests send injection payloads.
- **XSS** — React escapes all user text; the only `dangerouslySetInnerHTML` is JSON-LD with `<` escaped. Tests confirm stored payloads render as text in the admin.
- **CSRF** — cookies are `HttpOnly`, `SameSite=Lax`, `Secure` in production. State changes go through Server Actions (Next.js rejects calls whose `Origin` doesn't match the host) or POST routes. `/api/uploads` also checks `Origin`. The one GET with side effects (`/api/cron/availability`) needs `CRON_SECRET`. Tests confirm forged cross-origin calls are rejected.
- **Authorization / BOLA** — every seller query is scoped by `sellerId` from the session. Every admin page and action calls `requireAdmin()`. Tests confirm seller A can't open, edit or act on seller B's plots, and sellers can't call admin actions.
- **CORS** — the app sets no CORS headers, so browsers block cross-origin reads. There's no wildcard and nothing to tighten.
- **Tokens** — no JWTs. Sessions are 256-bit random tokens, stored hashed, in httpOnly cookies, never in `localStorage`. Logout deletes the server record. Blocking a seller deletes all their sessions.
- **Passwords** — scrypt with a random salt and constant-time comparison. Argon2id would need a new native dependency; scrypt is an accepted memory-hard alternative.
- **SSRF** — the server only fetches fixed hosts (`graph.facebook.com`, Meta's media CDN, `nominatim.openstreetmap.org`). No user-supplied URL is ever fetched.
- **Webhooks** — WhatsApp POSTs are verified with HMAC-SHA256 over the raw body using a constant-time comparison, and rejected in production without `WHATSAPP_APP_SECRET`. Retries are de-duplicated by message id.
- **Source maps** — none are published (`.next/static` has no `.map` files; checked in CI).
- **Git history** — scanned for database URLs, Blob, cron and WhatsApp tokens. Nothing found.

## 3. Database & RLS

- RLS is **enabled on every table with no policies**. Supabase's `anon`/`authenticated` roles (the auto-generated REST/GraphQL APIs) get no rows at all. The app connects as the table owner, which bypasses RLS, so **authorization lives in the application** (and is tested). Per-user RLS policies wouldn't add protection here: no client ever talks to Postgres directly.
- New tables (`rate_limit_buckets`, `reports`, `audit_logs`) follow the same rule. Reports use `ON DELETE RESTRICT` toward plots and sellers so moderation evidence can't disappear in a cascade. CHECK constraints mirror the app's validation.
- All changes are additive, versioned migrations, applied by `prisma migrate deploy` during each production build (`vercel-build`). If a migration fails, the build fails and the live site is unchanged.
- **Not least-privilege yet:** the app uses the `postgres` owner credentials. See §10.

## 4. Authentication, sessions, rate limiting

**Admin two-step sign-in** (`/admin/security`): authenticator-app TOTP (RFC 6238, verified against the RFC test vectors), a ±30 s window, and no code reuse. The secret is stored AES-256-GCM encrypted with a key derived from `SESSION_SECRET`. There are 8 single-use recovery codes (scrypt-hashed). Between password and code the browser holds only a 5-minute signed `SameSite=Strict` cookie, never a session. Turning it on signs out other devices. With `ADMIN_REQUIRE_MFA=true`, admins without it can't use the admin. Lost phone and codes: `ADMIN_RESET_MFA=true pnpm db:create-admin …`.

**Rate limits** are shared across all Vercel instances, using Postgres fixed windows (`src/lib/rate-limit.ts`). IP limits use only the platform-set header in `TRUSTED_IP_HEADER` (`x-real-ip` on Vercel); `X-Forwarded-For` is ignored, and tests prove spoofing it doesn't help. The limiter fails open, so it can never take the site down by itself.

| What | Limit | Why |
|---|---|---|
| Admin login | 8 / 15 min per email, 20 / 15 min per IP | existing; can't be bypassed via headers |
| Admin second step | 6 / 15 min per admin | 10⁶ codes; ~1 guess per 2.5 min |
| OTP send | cooldown 45 s; 5 / h per phone; 15 / h per IP; 500 / h global | existing; stops SMS/WhatsApp pumping |
| OTP check | 5 tries per code; 30 / 10 min per IP | stops spraying guesses across numbers |
| Seller ID / phone lookup | 30 / 10 min per IP | stops enumeration |
| No-code sign-in (only without WhatsApp) | 5 / 15 min per Seller ID, 10 / 15 min per IP | both values can be learnt |
| Enquiries | 20 / 10 min per IP, 30 / h per plot | protects sellers from fake buyer pings |
| Analytics events | 300 / 10 min per IP | a page sends a handful |
| Plot views | 1 counted / 30 min per IP per plot | honest view counts |
| Uploads | 60 / h and 300 / day per account | decode + storage cost |
| Seller add / edit plot | 20 / day, 60 / h | counted only for valid submissions |
| Buyer reports | 10 / h per IP, 10 / day per reporter, 50 / h per target | anti-spam; repeats are de-duplicated, not counted |

Limited API calls answer **HTTP 429 with `Retry-After`**. Server Actions return a plain message.

## 5. Headers

These headers are on every response:

- **`Content-Security-Policy`**, built from these directives:
  - `default-src 'self'`
  - `object-src 'none'`
  - `frame-ancestors 'none'`
  - `base-uri 'self'`
  - `form-action 'self'`
  - `img-src`/`connect-src` limited to Blob, OpenStreetMap tiles and Nominatim
  - `upgrade-insecure-requests` on Vercel
- **`X-Frame-Options: DENY`**
- **`X-Content-Type-Options: nosniff`**
- **`Referrer-Policy: strict-origin-when-cross-origin`**
- **`Permissions-Policy`**, which allows geolocation for the site itself only
- **`Cross-Origin-Opener-Policy: same-origin`**
- **HSTS** on Vercel

`X-Powered-By` is removed.

`script-src` keeps `'unsafe-inline'` because Next.js streams page data as inline scripts. Nonces would force every page to render dynamically and disable caching. This trade-off is documented in Next's CSP guide. XSS defence rests primarily on React escaping and on the fact that no user HTML is rendered.

## 6. Performance (measured)

Local production build (`next start`), seed data (~40 plots), local Postgres, 300 requests per URL at concurrency 10 (`bench.mjs`). These are not production numbers.

| Page | Before p50 / p95 / p99 | After p50 / p95 / p99 | Throughput |
|---|---|---|---|
| Plot page | 58 / 75 / 83 ms | **13 / 15 / 27 ms** | 166 → **738 req/s** |
| Home | 18 / 23 / 37 ms | 14 / 18 / 23 ms | ≈ (cached both) |
| City page | 15 / 19 / 24 ms | 14 / 17 / 17 ms | ≈ |
| Search | 81 / 104 / 143 ms | 82 / 98 / 131 ms | ≈ (per-request by design) |
| Seller profile | 58 / 68 / 74 ms | 62 / 75 / 82 ms | ≈ (dynamic by design) |

All runs: 0 errors.

The plot page was rendered on every request. It is now rendered on first visit and cached (`generateStaticParams → []`, 60 s revalidation). Every status change — from admin, dashboard, WhatsApp or the daily job — refreshes it immediately (`refreshListingPages`). The page contains nothing per-visitor; contact, report and view counting run in the browser.

Rate limiting adds one indexed upsert to the endpoints it guards. The other measured pages show no regression beyond run-to-run noise.

Existing indexes already match the main query shapes (`[status, cityId, landType]`, `[status, price]`, `[sellerId, status]`, …). Text search uses `ILIKE '%q%'`; beyond tens of thousands of plots, add `pg_trgm` GIN indexes on `locality`/`title`.

## 7. Tests (all run; see CI)

| Command | Scope | Result at audit time |
|---|---|---|
| `pnpm check:security` | unit + DB: search params, allowlists, open redirects, TOTP vectors/replay, MFA encryption, env check, upload content validation (SVG, fake JPEG, GIF, 64 MP bomb, EXIF strip), webhook signatures, cron auth, shared rate limiter incl. concurrency, report submission/validation/dedupe/races/limits/injection, moderation workflow + audit log, filters/counts | 131 passed, 0 failed |
| `pnpm check:http` | against a production build: headers, admin/seller authorization on pages and Server Actions, forged cross-origin calls, cross-seller access, uploads, rate limits + header spoofing, reporting end-to-end, reporter privacy, stored XSS, admin two-step sign-in | 57 passed, 0 failed |
| `pnpm check:profile`, `check-whatsapp-parse` | existing feature checks | 44 + 228 passed |
| `pnpm typecheck`, `pnpm lint`, `pnpm build` | | clean |
| `pnpm audit --prod` | runtime dependencies | no known vulnerabilities |
| `pnpm audit` (all) | incl. dev tools | 1 high: `braces` via `eslint-config-next` (dev-only, **no patched version exists**) |

Scanners only know published advisories. "No known vulnerabilities" isn't proof of none.

## 8. Not verified / remaining

- **C1 `DEMO_MODE`** (above) — the biggest remaining risk.
- Admin two-step sign-in isn't enforced until `ADMIN_REQUIRE_MFA=true` is set.
- The app's database role is the owner (`postgres`), so least privilege isn't applied (§10).
- Vercel settings that can't be read from the repository:
  - Firewall / attack-challenge mode
  - Deployment protection for previews
  - Who has access to the project
- Supabase settings that can't be read from the repository:
  - Network restrictions
  - Backup / PITR plan (the Free plan has no point-in-time recovery)
  - Dashboard MFA for your Supabase account
- Load tests ran only locally on seed data, not against production.
- Page requests (search, plot pages) have no app-level rate limit. They rely on Vercel's platform DDoS protection and on caching.
- The WhatsApp webhook has no timestamp-based replay window, because Meta doesn't sign one. Replays are de-duplicated by message id.
- Uploaded photos are public-by-URL (unguessable names). That's intended, since all photos are public listing photos. Don't reuse this storage for private documents; use private Blob plus signed URLs for those.

**Optional AI (WhatsApp assistant).** When `AI_ENABLED=true`, a seller's chat messages are sent to the configured AI provider. Before anything leaves the server:
- Phone numbers and 12-digit (Aadhaar-like) numbers are masked.
- Text is capped at 1,200 characters.

What the AI returns is constrained:
- Extracted fields are schema-validated and range-checked, then go through the same checks as typed answers.
- Replies are plain text, with any link other than ours removed.
- The AI can't publish, approve or change anything.

Calls are rate-limited per chat and globally, time out, and fall back to fixed replies. Choose a provider whose data-retention terms you accept, and mention it in your privacy policy.

## 9. Environment variables

`.env.example` documents every variable (placeholders only). New since this audit:

- `ADMIN_REQUIRE_MFA` — optional, but recommended in production.
- `vercel-build` — not a variable but a new package script: production builds now run `prisma migrate deploy` before `next build`, using `DIRECT_URL`.

The server refuses to start in production without `DATABASE_URL` and `SESSION_SECRET`. It logs warnings for weak or missing `CRON_SECRET` and `TRUSTED_IP_HEADER`, for `DEMO_MODE` being on, and for MFA not being enforced.

## 10. Manual actions (owner)

1. **Rotate the Supabase database password.** It was shared in a chat. In Supabase → Database → Reset password, then update `DATABASE_URL` and `DIRECT_URL` in Vercel (Sensitive) and redeploy.
2. **Turn on admin two-step sign-in.** Each admin opens `/admin/security` and sets it up. Then set `ADMIN_REQUIRE_MFA=true` in Vercel.
3. **Connect WhatsApp, then turn off `DEMO_MODE`.** This needs the Meta token, phone number ID, app secret and an approved OTP template. Then:
   - Set `KYC_PROVIDER` to a real provider, or leave it empty.
   - Re-check sellers whose identity was "verified" by the mock (`identityProvider = 'mock'`).
4. **Least privilege.** Create a dedicated Postgres role for the app with `SELECT/INSERT/UPDATE/DELETE` on `public` tables only, and use it in `DATABASE_URL`. Keep the owner credentials only in `DIRECT_URL` for migrations.
5. **Supabase:** enable MFA on your Supabase account, and consider the paid plan for point-in-time recovery. Test a restore once.
6. **Vercel:**
   - Enable deployment protection for preview deployments.
   - Review project members.
   - Enable spend alerts for Blob and Functions.
7. **Incident response.** If a secret leaks, rotate it in the provider first, then update it in Vercel and redeploy. Removing it from git alone isn't enough. To end all sessions, delete the rows in `seller_sessions` / `admin_sessions`.

## 11. Launch checklist (in order)

1. [ ] WhatsApp connected; `DEMO_MODE` removed; OTP template approved (C1)
2. [ ] Supabase password rotated; Vercel env updated
3. [ ] All admins enrolled in two-step sign-in; `ADMIN_REQUIRE_MFA=true`
4. [ ] Dedicated least-privilege DB role for the app
5. [ ] Real KYC provider (or identity badges hidden); mock-verified sellers re-checked
6. [ ] `WHATSAPP_APP_SECRET` + `WHATSAPP_VERIFY_TOKEN` set (webhook rejects everything without them)
7. [ ] CI green on `main` (typecheck, lint, checks, build, audit, gitleaks, CodeQL)
8. [ ] Backups/PITR confirmed and a restore tested
9. [ ] Vercel firewall + spend alerts; preview protection on
10. [ ] Review `/admin/reports` and the audit log routinely
