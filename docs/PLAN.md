# Plots — MVP Plan

> A land-only marketplace. Buyers discover land near a place they care about and reach the
> seller/broker on WhatsApp in one tap. Sellers list land in under 3 minutes.

**The one metric that matters:** _enquiries per active listing per week._
If buyers find listings and tap "Contact on WhatsApp", the marketplace works. Everything else is secondary.

"Plots" is a working name. It lives in one constant (`src/lib/site.ts`) so we can rename later.

---

## 1. Product architecture

```
                    ┌────────────────────────────── Vercel ──────────────────────────────┐
 Buyer (mobile) ──▶ │  Next.js 16 (App Router, RSC)                                      │
 Seller (mobile) ─▶ │   • Public pages: server-rendered, cached → fast + SEO             │
 Admin (laptop) ──▶ │   • Mutations: Server Actions (zod-validated)                      │
                    │   • Route handlers: OTP, upload presign, cron, (later) WA webhook  │
                    │   • proxy.ts: guards /sell, /my-listings, /admin                   │
                    └──────┬──────────────┬───────────────┬──────────────┬───────────────┘
                           │              │               │              │
                    PostgreSQL       Cloudflare R2     SMS OTP        OpenStreetMap
                    (Neon) via       (S3 API, images,  (MSG91;        tiles + Leaflet
                    Prisma 7         presigned PUT)    console in dev)
```

**One Next.js app (a monolith), not a frontend plus a separate API.**
- *Why:* one deploy, one language, one repo. Server Components render the SEO pages and the database reads directly; Server Actions handle the forms.
- *Problem solved:* a team of 1–2 people can ship every day without coordinating two services.
- *MVP?* Yes. We split it later only if a mobile app or a partner API needs a public API.

**Key infrastructure decisions**

| Decision | Choice | Why | MVP-critical? |
|---|---|---|---|
| DB | Postgres (Neon free tier) + Prisma 7 | Relational data (listings ↔ sellers ↔ enquiries), typed queries, managed migrations | Yes |
| Auth | Our own phone OTP and signed session cookie (`jose`) | NextAuth/Auth.js handle phone OTP poorly. Our version is about 150 lines we control. It also covers admin login: same OTP, with `role = ADMIN` | Yes |
| OTP delivery | Provider interface: `console` (dev) and `msg91` (prod) | MSG91 handles India's DLT SMS registration and costs about ₹0.2 per OTP. We can add WhatsApp OTP later without changing app code | Yes |
| Images | Cloudflare R2 with presigned uploads; images compressed in the browser first | Rural 4G uploads are slow, so 8 MB phone photos become ~300 KB before upload. R2 has no egress fees. In dev, a local driver writes to `public/uploads` | Yes |
| Maps | OpenStreetMap + Leaflet | No API key or billing. We only need an approximate location | Yes |
| WhatsApp | `wa.me` deep links with a pre-filled message | No API approval needed, works on every phone, costs nothing | Yes |
| WhatsApp Business API | Not yet | Needs Meta approval and template messages. We start the availability loop manually (see §4.4) | Later |
| Analytics | Enquiries counted in our own DB, plus Vercel Analytics for page views | Our key metric lives in our tables. We skip heavy tooling | Light |

---

## 2. Design direction — "premium, calm, trustworthy"

Land is the biggest purchase most families make. The product should feel like a private bank
or a good architecture studio, not a classifieds board.

- **Type:** *Plus Jakarta Sans* throughout — modern and confident; prices use tabular numbers.
- **Colour:** green and white. One emerald brand green (`brand-50…950`), white surfaces, soft mint section tints, faintly green-tinted greys. No rainbow badges.
- **Surfaces:** generous whitespace, 1px hairline borders instead of heavy shadows, `rounded-2xl` cards, 4:3 imagery with blur placeholders.
- **Mobile-first patterns:** a sticky bottom action bar on the detail page (WhatsApp and Call), bottom-sheet filters, 48px tap targets, and thumb-reach CTAs.
- **Indian formatting everywhere:** ₹45 Lakh, ₹1.2 Cr, and areas shown in the unit the seller used plus a common conversion (e.g. "2 Bigha · ≈ 54,450 sq ft").
- **Honest trust language:** the only badge is "Phone verified seller". Every detail page carries a calm disclaimer: _"Plots has not verified ownership or documents. Always check papers before paying."_
- **Motion:** restrained. Skeleton loaders, 150–200 ms fades, no bouncy animations.
- **Later:** Hindi UI (`Noto Sans Devanagari`). The strings are structured so they can be extracted.

---

## 3. Folder structure

```
plots/
├─ docs/PLAN.md                     ← this file
├─ docker-compose.yml               ← local Postgres
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts                       ← Azamgarh cities + sample listings
├─ prisma.config.ts
├─ public/
└─ src/
   ├─ app/
   │  ├─ (site)/                    ← public site, shared header/footer
   │  │  ├─ page.tsx                ← landing
   │  │  ├─ search/page.tsx         ← results + filters (URL = state, shareable)
   │  │  ├─ property/[slug]/page.tsx← detail
   │  │  └─ [city]/page.tsx         ← /azamgarh SEO landing (404 if unknown)
   │  ├─ sell/                      ← OTP → listing form → success
   │  ├─ my-listings/               ← seller: status, "still available", mark sold
   │  ├─ login/                     ← OTP login (sellers + admins)
   │  ├─ admin/                     ← moderation queue, listings, enquiries, sellers
   │  ├─ api/
   │  │  ├─ auth/otp/{send,verify}/route.ts
   │  │  ├─ uploads/presign/route.ts
   │  │  └─ cron/availability/route.ts
   │  ├─ sitemap.ts · robots.ts
   │  └─ layout.tsx · globals.css   ← design tokens
   ├─ components/
   │  ├─ ui/                        ← Button, Input, Select, Sheet, Badge… (our primitives)
   │  └─ listing/                   ← PropertyCard, Gallery, ContactBar, FilterSheet…
   ├─ lib/
   │  ├─ db.ts                      ← Prisma singleton
   │  ├─ site.ts                    ← brand name, URLs, reserved slugs
   │  ├─ format.ts                  ← ₹ Lakh/Cr, dates
   │  ├─ units.ts                   ← area units ↔ sq ft (bigha is per-city!)
   │  ├─ whatsapp.ts                ← wa.me links + message templates
   │  ├─ auth/                      ← session cookie, OTP, guards
   │  ├─ storage/                   ← r2 | local drivers
   │  └─ validation/                ← zod schemas shared by form + server
   ├─ server/                       ← queries.ts / actions.ts per domain
   ├─ generated/prisma/             ← Prisma client (git-ignored)
   └─ proxy.ts                      ← route guards
```

*Why a `(site)` route group:* the public pages share a header/footer, while `/admin` and `/sell` get focused, distraction-free layouts.
*Why `[city]` at the root:* `/azamgarh` is the cleanest SEO URL. Static routes (`/sell`, `/admin`…) always win in Next.js routing, and `site.ts` keeps a reserved-slug list so a city can never shadow a page.

---

## 4. Database schema (Prisma — see `prisma/schema.prisma`)

```
User ─┬─< Property ─┬─< PropertyImage
      │             └─< Enquiry
City ─┴─< Property
OtpCode (standalone, short-lived)
```

| Model | Purpose | Notable decisions |
|---|---|---|
| **User** | Sellers/brokers and admins | Buyers do **not** need accounts (no friction). `phone` is unique in E.164 format. `sellerType` is OWNER or BROKER, shown on cards. `phoneVerifiedAt` drives the only trust badge we show. |
| **City** | The unit behind `/azamgarh`-style pages and the location hierarchy | Holds `state`, `district`, `slug`, SEO intro copy, map centre, `isLive`, and **`bighaInSqft`**. A bigha is a different size in UP, Rajasthan, Bihar and Assam, so the conversion has to be per city. Sellers choose from live cities only, which keeps the location data clean. |
| **Property** | A listing | `area` + `areaUnit` exactly as the seller entered them, **plus `areaSqft` normalised** for filtering and sorting across units. `price` is total INR as `BigInt` (crores overflow 32-bit ints). `locality`/`village` are free text. `latitude`/`longitude` are optional and shown approximately (see below). `slug` is used for SEO URLs. Lifecycle fields: `status`, `hiddenReason`, `rejectionReason`, `publishedAt`, `lastConfirmedAt`, `availabilityCheckSentAt`, `soldAt`. |
| **PropertyImage** | Ordered photos | A separate table rather than a `String[]` column, so we can reorder, set a cover, delete one image, and store width/height for layout-stable rendering. |
| **Enquiry** | One row per contact attempt | `channel` (WHATSAPP/CALL), `buyerName`, `buyerPhone`, `source` (search/city/detail). **This table is our core metric.** |
| **OtpCode** | Phone verification | Stores a **hash** of the code, never the code itself, with an expiry, attempt counter and consumed flag. Combined with rate limiting, this blocks brute-forcing and SMS-pumping fraud. |

**Status machine**

```
            admin approve            seller/admin "sold"
 PENDING ──────────────▶ ACTIVE ─────────────────────▶ SOLD
    │                    │   ▲
    │ admin reject       │   │ seller replies YES / taps "Still available"
    ▼                    ▼   │
 REJECTED            HIDDEN ─┘   (no reply to availability check, or admin hide)
```
Nothing becomes SOLD automatically, as specified. Silence leads to HIDDEN, and listings can always be brought back.

**Approximate location.** We show a ~500 m circle, not a pin.
- *Why:* brokers are afraid of being bypassed. If the exact plot is on the map, buyers go around them, and brokers stop listing. A fuzzy circle protects them and also protects owners' privacy.
- *MVP?* Yes. It costs almost nothing and directly protects supply.

---

## 5. User flows

### 5.1 Buyer — discover → contact (target: < 60 s)
1. Lands on `/` or `/azamgarh`, usually from a shared WhatsApp link or a Google search.
2. Types a locality, or taps a land-type chip, and goes to `/search?city=azamgarh&type=AGRICULTURAL`.
3. Scrolls cards (photo, ₹ price, size, locality, type, Owner/Broker), and refines filters in a bottom sheet.
4. Opens a detail page: gallery, key facts, approximate map, description, listed date.
5. Taps **Contact Seller on WhatsApp**. The first time, a small sheet asks for *name and phone* (no OTP; remembered on the device). We save an Enquiry, and WhatsApp opens with a pre-filled message:
   _"Hi, I saw your land on Plots: 2 Bigha agricultural land in Sathiyaon, Azamgarh (₹18 Lakh). Is it available? plots.in/property/…"_
   - *Why ask for name and phone?* It is the only way to measure demand, send leads to sellers who miss WhatsApp messages, and follow up with "did the seller respond?". It costs one extra screen, once per device. **We'll A/B test** "required" against "skippable" once traffic exists.

### 5.2 Seller — list in under 3 minutes
1. Taps **Sell your land** (also linked directly from our WhatsApp broadcast messages).
2. Enters a mobile number and receives an OTP. A new user is created at this point.
3. Fills a single-page form in 3 short sections: *About you* (name, Owner/Broker), *The land* (type, size and unit, price, city then locality/village, optional "Use my current location" pin), *Photos and description* (up to 10 photos, compressed on the phone).
4. Submits. The success screen says "Under review, usually live within a few hours", with a WhatsApp share button.
5. An admin approves, and the listing goes live. (Later: the seller gets a WhatsApp/SMS notification.)

### 5.3 Concierge listing (admin on behalf of seller) — our real supply engine at launch
Brokers will send details and photos on WhatsApp long before they fill in any form. The admin can
**create a listing for a phone number** in about a minute. *This is how we get the first 100 listings.*

### 5.4 Admin
OTP login (phone on the `ADMIN_PHONES` allowlist) → **Review queue** (pending listings: approve / reject with reason / edit) →
**Listings** (filter by status; hide, mark sold, edit) → **Enquiries** (who contacted what, when) → **Sellers**.

### 5.5 Availability loop (manual-first, automate later)
- A daily cron marks ACTIVE listings unconfirmed for 30+ days as *needs check*.
- **MVP:** the admin sees an "Availability checks" list with one-tap `wa.me` messages: _"Is your land in Sathiyaon still available? Reply YES."_ The seller can also tap **Still available** in `/my-listings`.
- No confirmation within 7 days → HIDDEN, and the seller is told _"Your listing is hidden because we could not confirm availability. Reply YES to reactivate."_
- **Later:** the same state machine, with messages sent and received through the WhatsApp Business API.

---

## 6. Development roadmap

| # | Step | Status |
|---|---|---|
| 1 | **Foundation**: scaffold, design tokens, Prisma schema, migrations, seed | ✅ Done |
| 2 | **Buyer experience**: landing, `/[city]`, `/search` with filters, plot detail with gallery and approximate map | ✅ Done |
| 3 | **Contact**: buyer details sheet (asked once), WhatsApp/Call deep links, enquiry capture | ✅ Done |
| 4 | **Auth**: Seller ID + WhatsApp OTP for sellers; email + password for admins (same approach as the shop project) | ✅ Done |
| 5 | **Listing**: WhatsApp listing assistant (primary) + web "Add plot" form with photo upload | ✅ Done |
| 6 | **Admin**: review queue, edit, status actions, sellers, enquiries, WhatsApp inbox + simulator, create-for-seller | ✅ Done |
| 7 | **Seller dashboard + availability loop**: plots, enquiries, sold / still available, daily cron | ✅ Done |
| 8 | **Launch**: real WhatsApp number + templates, hosted Postgres, R2 image storage, domain, analytics | Next |

**Changes from the original plan (Step 2 feedback):**
- The brand is **green and white**, with Plus Jakarta Sans throughout and a mobile-first layout: a bottom tab bar, a sticky contact bar and bottom-sheet filters.
- Sellers list **through WhatsApp first**: a guided assistant collects the details and photos, an admin verifies, then the plot goes live.
- Every seller gets a permanent **Seller ID** (`SLR-XXXXXX`, random, the same unambiguous alphabet as the shop's customer IDs). They sign in at `/seller` with it plus a WhatsApp code.
- Admin login is email + password, mirroring the shop project.

**Explicitly out of scope:** payments, escrow, document/legal verification, transactions, AI features, blockchain, heavy analytics, multi-language UI, a native app.

**Launch checklist (non-code, but decides success):** 50+ listings seeded via concierge before the first buyer campaign · 10 broker relationships in Azamgarh · a WhatsApp group distribution plan · a weekly metric review (listings, enquiries per listing, % of listings with at least one enquiry, seller response rate).
