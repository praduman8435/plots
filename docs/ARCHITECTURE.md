# Plots — Architecture

How the system actually works today (Oct 2026). For findings, fixes and the scaling plan see [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md); for security see [SECURITY.md](SECURITY.md).

## 1. System overview

One Next.js 16 application (App Router, React 19, TypeScript), deployed on Vercel (region `sin1`). It is a modular monolith: there are no other services. Postgres on Supabase is the single source of truth, including for rate limits and the audit log.

```mermaid
flowchart LR
  subgraph Browser["Mobile / desktop browser"]
    UI["React client components<br/>(contact, report sheet, forms, chat)"]
  end
  subgraph Vercel["Vercel (sin1)"]
    CDN["Edge cache / CDN<br/>(ISR pages, static assets,<br/>/_next/image AVIF/WebP)"]
    APP["Next.js server functions<br/>Server Components · Server Actions · Route Handlers"]
    CRON["Vercel Cron 04:30 UTC<br/>/api/cron/availability"]
  end
  PG[("Supabase Postgres<br/>via Supavisor pooler")]
  BLOB[("Vercel Blob<br/>plot photos (public, random names)")]
  META["Meta WhatsApp Cloud API"]
  OSM["OpenStreetMap tiles +<br/>Nominatim geocoder"]

  UI -- "HTML / RSC / Server Actions" --> CDN --> APP
  APP -- "Prisma 7 + pg (pool ≤5/instance,<br/>15 s statement timeout)" --> PG
  APP -- "put (uploads)" --> BLOB
  CDN -- "photo bytes" --> BLOB
  APP -- "send messages / fetch media" --> META
  META -- "webhook (HMAC-signed)" --> APP
  CRON --> APP
  UI -- "map tiles, place search" --> OSM
  APP -- "geocode new cities" --> OSM
```

| Concern | Where it lives |
|---|---|
| Pages and UI | `src/app/(site)` (public + seller), `src/app/admin` (staff), `src/components/*` |
| Domain logic | `src/server/*` — `listings/service.ts` (listing state machine), `listings/queries.ts`, `seller/*`, `reports/*`, `whatsapp/*`, `kyc/*`, `cities.ts`, `audit.ts`, `maintenance.ts` |
| Mutations | Server Actions in `src/server/actions/**` (thin: auth → validate → call domain) and Route Handlers in `src/app/api/**` |
| Cross-cutting | `src/lib/*` — `db.ts`, `rate-limit.ts`, `request-ip.ts`, `log.ts`, `listing-visibility.ts`, `seller/session.ts`, `admin/{session,require,mfa}.ts`, `env-check.ts` |
| Schema and migrations | `prisma/schema.prisma`, `prisma/migrations/*` (versioned SQL, reviewed by hand) |

## 2. Request flows

**Buyer opens a plot** (`/property/[slug]`, ISR):

1. The CDN serves the cached HTML, which is refreshed every 60 s or immediately when the plot's status changes.
2. On a cache miss, the server function runs `getListingBySlug` → `isPubliclyViewable` → render.
3. Photos come from `/_next/image` (AVIF/WebP, sized per device), fetched from Blob.
4. The browser then:
   - posts a view beacon (`/api/properties/[id]/view`, rate limited);
   - loads the map near the viewport;
   - for WhatsApp/Call, posts `/api/enquiries` (rate limited, logged) and opens `wa.me`/`tel:` directly. The seller notification is sent after the response (`after()`).

**Buyer searches** (`/search`, rendered per request):

1. `loading.tsx` shows a skeleton instantly.
2. `parseSearchParams` allowlists and clamps the URL.
3. One `count` and one `findMany` run with an indexed default sort, 12 per page, capped at 500 pages.

**Seller lists a plot**:
- **Web:** OTP sign-in → `createSellerListing` (session, validation, rate limit) → `createListing` (PENDING) → an admin approves.
- **WhatsApp:** Meta → `POST /api/whatsapp/webhook` (HMAC verified, 200 at once) → `after()` → `processInbound` (de-duplicated by message id) → bot state machine → `createListing`.

**Status changes**: every path calls `changeListingStatus` (`src/server/listings/service.ts`): admin, seller dashboard, WhatsApp bot and the daily cron. It's the only writer of listing status:
- writes are compare-and-set;
- a suspended seller's plot can't go live;
- cached pages are refreshed.

**Reports**: the report sheet calls the `reportAction` Server Action.
- `submitReport` resolves the target from trusted records and checks the visibility rule.
- It de-duplicates per reporter and target (unique `dedupeKey`) and applies rate limits.
- Admins work reports in `/admin/reports`; every action is written to `audit_logs`.

**Daily cron** (`/api/cron/availability`, `CRON_SECRET`):
- sends weekly availability checks and hides plots that went unanswered (through `changeListingStatus`);
- prunes expired sessions, OTPs, rate-limit counters and login attempts.

## 3. Data model (key relationships)

```mermaid
erDiagram
  Seller ||--o{ Property : lists
  Seller ||--o{ SellerSession : has
  Seller ||--o{ KycAttempt : has
  Seller ||--o| WhatsAppConversation : chats
  City ||--o{ Property : contains
  Property ||--o{ PropertyImage : has
  Property ||--o{ Enquiry : receives
  Property ||--o{ Report : "reported in (RESTRICT)"
  Seller ||--o{ Report : "reported (RESTRICT)"
  Seller ||--o{ Report : "filed (SET NULL)"
  AdminUser ||--o{ AdminSession : has
  AdminUser ||--o{ AuditLog : wrote
  Report ||--o{ AuditLog : "history (SET NULL)"
```

**Integrity rules enforced in the database:**

| Rule | How |
|---|---|
| One account per phone number; one profile URL per seller | Unique `sellers.phone`, `sellers.code`, `sellers.profileSlug` |
| Unique plot identifiers | Unique `properties.code`, `properties.slug` |
| One open report per reporter per target | Unique `reports.dedupeKey`, cleared when the report closes |
| A listing report must name a plot | CHECK `reports_target_matches` |
| An "Other" report needs a real description | CHECK `reports_other_needs_description` |
| Bounded text sizes | Length CHECKs on report descriptions and audit notes |
| Moderation evidence can't disappear | `RESTRICT` foreign keys from reports to plots and sellers, plus label snapshots on each report |
| History is never rewritten | `audit_logs` uses plain-string target ids (no FK) and is append-only |
| Supabase's public API roles see nothing | RLS is enabled on every table with no policies; the app connects as the owner. **Authorization is enforced in the app.** |

**Listing lifecycle** (only `changeListingStatus` writes it):

```
PENDING ──approve──▶ ACTIVE ──mark sold──▶ SOLD ──relist / YES──▶ ACTIVE
   │                   │ ├─hide (seller/admin)──▶ HIDDEN(BY_*) ──unhide──▶ ACTIVE
   └──reject──▶ REJECTED │ └─no reply to weekly check──▶ HIDDEN(AVAILABILITY_UNCONFIRMED) ──YES──▶ ACTIVE
                         └─(seller edits) ──▶ PENDING again (same transaction as the edit)
```

**Public visibility** is decided in one place, `src/lib/listing-visibility.ts`:
- Live and sold plots are viewable.
- Plots paused for "no reply" are viewable, shown as "not available" with no contact buttons.
- Plots hidden by the seller or an admin, unpublished plots, and anything from a suspended seller are not viewable.

Search, home and profile pages list `ACTIVE` plots only. A suspended seller has no `ACTIVE` plots: suspending hides them, and they can't be made live again.

## 4. Authentication, authorization, trust boundaries

| Actor | Proof | Session | Checked by |
|---|---|---|---|
| Buyer | none | none | public routes only, rate limits per trusted IP |
| Seller | WhatsApp OTP (scrypt-hashed codes) | 256-bit random token, SHA-256 stored, httpOnly SameSite=Lax cookie, 30 days | `requireSeller()` / `getSellerSession()`; every query scoped by `sellerId` |
| Admin | email + scrypt password + optional TOTP | same design, 14 days | `requireAdmin()` on every admin page and action (also enforces `ADMIN_REQUIRE_MFA`) |
| Cron | `CRON_SECRET` bearer | — | constant-time compare |
| Meta | HMAC-SHA256 of raw body | — | `WHATSAPP_APP_SECRET` |

Trust boundaries:
- **Browser → server:** everything from the client is validated. Ids name only *which* public object. Ownership, sellers and roles always come from the server.
- **Server → DB:** owner credentials, parameterized queries only.
- **Server → Meta/OSM:** fixed hosts, timeouts, size caps.

## 5. Caching and freshness

| Content | Strategy | Invalidation |
|---|---|---|
| Home, city, city×type pages | ISR, 60 s | `revalidatePath` on every status change and seller suspension |
| Plot page | ISR on first visit (`generateStaticParams → []`), 60 s | same; a plot that disappears returns 404 immediately |
| Seller profile `/s/…` | rendered per request | — |
| Search | rendered per request (unbounded query space; no shared cache) | — |
| Seller/admin pages, APIs | per request; Next sends `private, no-store` | — |
| Photos | `/_next/image` + CDN; Blob objects are immutable with random names | — |
| Sitemap | 1 h | — |

Shared caches only hold pages without per-visitor content. Contact, report and view-counting run in the browser.

## 6. External integrations and failure behaviour

| Dependency | If it fails |
|---|---|
| Postgres | Requests fail with the generic error page. The pool waits ≤5 s for a connection and queries ≤15 s. `/api/health` returns 503. |
| WhatsApp (send) | One retry, only for network errors (never after an HTTP response, to avoid double-sends), 10 s timeout. Failure is logged. The status change still stands, and admins see "not delivered". |
| WhatsApp (webhook) | 200 as soon as the signature is valid. Processing runs after the response. Meta retries are de-duplicated by message id. A processing error is logged; the message stays in the inbox for an admin. |
| OTP delivery | The code is stored only if the send succeeded, so no cooldown is burnt on a failed send. |
| Nominatim | 4 s timeout. New-city creation falls back to "not found" and the user retypes. |
| Blob / image processing | Upload returns a 4xx/5xx message; nothing is saved. |
| Rate-limit table | Fails open (logged), so the limiter never takes the site down. |
| KYC provider | Only a mock exists. A real provider plugs into `server/kyc/provider.ts`, and outcomes are fetched server-side, never read from redirects. |

## 6a. WhatsApp assistant: language and optional AI

- **Language.** A new chat starts with "English / हिंदी" (stored on `whatsapp_conversations.language`); *LANGUAGE* / *भाषा* switches anytime. Every message, including notifications, comes from `src/server/whatsapp/copy.ts` in the seller's language. Hindi replies ("हाँ", "नहीं 2", "२ बीघा", "18 लाख", state names in Devanagari) are understood. A city typed in Hindi is matched to its English name via OpenStreetMap, so it never creates a duplicate city. Older chats continue in English.
- **Sellers only.** The assistant no longer asks owner vs broker; everyone is a seller (the stored field stays for older records).
- **Optional AI** (`src/server/ai`). Off unless `AI_ENABLED=true` and a real `AI_API_KEY` exist. Providers: OpenAI, Anthropic Claude, xAI Grok, Gemini (OpenAI endpoint), Groq, OpenRouter, or any OpenAI-compatible URL, all through plain `fetch`. It is used only where the fixed parser didn't understand:
  1. *Extraction.* Listing details are pulled out of free-form messages ("2 bigha khet Azamgarh 18 lakh"). The details are validated like typed answers, and questions already answered are skipped.
  2. *Reply.* A short, respectful answer in the seller's language, followed by the same question again.
- **AI guardrails:**
  - It can't take actions; listings are still reviewed by our team.
  - Phone and Aadhaar-like numbers are masked before sending, and only links to our own site are kept in replies.
  - Calls time out after 8 s and are capped per chat and per day (Postgres limiter).
  - Any failure falls back to the fixed reply.
  - Prompts and replies are never logged.

## 7. Deployment and migrations

- Push to `main`:
  1. GitHub CI runs typecheck, lint, the unit/DB/HTTP checks, build, dependency audit, gitleaks and CodeQL.
  2. Vercel runs `vercel-build`, which does `prisma migrate deploy` then `next build`.
- If a migration fails, the build fails and the previous deployment stays live.
- **Migrations land before new code goes live, but old code keeps serving during the build.** So every migration must be backward-compatible with the running code (expand → deploy → contract in a later release). Never drop or rename a column in the same release that stops using it.
- **Rollback:**
  - Code: Vercel "Promote" a previous deployment (instant).
  - Database: write a forward-fix migration. Prisma has no down-migrations, and restoring a backup loses newer data.
- Dependabot PR branches are not built by Vercel (no database in Preview). Any other Preview build would need its own database.
- Production env vars are validated at start-up (`src/lib/env-check.ts`).

## 8. Observability

- **Logs:** structured JSON lines (`src/lib/log.ts`), filterable by `event` in Vercel Logs. Sensitive fields are dropped automatically. Events include:
  - `request.unhandled_error` (every server error, with route and digest)
  - `rate_limited`, `rate_limit.unavailable`
  - `upload.failed`
  - `whatsapp.inbound_failed`
  - `audit.write_failed`
  - `maintenance.prune_failed`
  - `cron.availability_done`
- **Request correlation:** Vercel adds `x-vercel-id` to every request; its logs group lines per request.
- **Health:** `GET /api/health` returns `{status: ok|degraded}` and nothing else. Point an uptime monitor at it.
- **Moderation and admin activity:** `audit_logs`, visible per report and per plot/seller in the admin.

## 9. Backups and data lifecycle

These are recommendations; **verify them in the dashboards.**

- **Database:** Supabase backups depend on the plan. Point-in-time recovery is a paid add-on. Recommended targets: RPO ≤ 24 h now (daily backups), ≤ 5 min once paying sellers depend on it (PITR); RTO ≤ 4 h.
- **Restore drill:** restore into a separate Supabase project, run `pnpm check:integrity` against it, then delete it.
- **Photos:** Blob has no versioning. The app never deletes blobs, so DB restores keep their photos; a lost blob is lost. If photos become critical, mirror them periodically to a second bucket.
- **Retention:**
  - Expired sessions, OTPs, login attempts and rate-limit counters are pruned daily.
  - Reports and audit logs are kept indefinitely (moderation evidence).
  - Analytics events grow unbounded. Decide on a retention period (e.g. 18 months) when the table reaches millions of rows.

## 10. Future: land-intelligence map (not built)

The current design can absorb it without a rewrite:

- **Separate domain.** New tables, e.g. `parcels` (state, district, tehsil, village, survey/khasra/gata number, geometry, `source`, `source_ref`, `fetched_at`, `licence`), `parcel_sources` and `parcel_snapshots`. Government/cadastral data never goes into `properties`.
- **Explicit link.** `listing_parcel_links(property_id, parcel_id, method: 'verified_id' | 'spatial_match' | 'seller_claim', confidence, verified_by, verified_at)`. Link only on a reliable identifier or a verified spatial match. Show provenance in the UI.
- **Per-state adapters.** Each state's land-records source sits behind one interface (like `KycProvider`), with its own licence and terms.
- **Spatial support when it ships.** Enable PostGIS on the same Supabase Postgres (`geometry` columns, GiST indexes). `properties.latitude/longitude` stays the coarse marketplace location, and the public approximate-location privacy rule stays.
- **Not now.** No PostGIS, GIS service or map microservice until the feature is actually built.
