# Plots

A land-only marketplace for India, launching in Azamgarh.

- **Buyers** browse and contact sellers on WhatsApp or by phone. They never need to log in.
- **Owners and brokers** list land by chatting with our WhatsApp assistant (or with a web form). Each gets a permanent **Seller ID** (e.g. `SLR-7A41K2`) to sign in and see their plots and enquiries.
- **Admins** verify every plot before it goes live.

The product plan, architecture and schema rationale are in [docs/PLAN.md](docs/PLAN.md).

## Run locally

```bash
pnpm install          # also runs prisma generate
cp .env.example .env  # defaults work for local dev
pnpm db:up            # Postgres 17 in Docker on localhost:5440
pnpm db:migrate       # apply migrations
pnpm db:seed          # demo data: Chandigarh tricity + Azamgarh, sellers, admin, enquiries
pnpm dev              # http://localhost:3000
```

### Logins after seeding

| Who | Where | How |
| --- | --- | --- |
| Buyer | `/` | No login. Browse, then tap **WhatsApp** or **Call** on any plot. |
| Seller | `/seller` | Seller ID e.g. `SLR-GRPT28` (Chandigarh) or `SLR-RMSH27` (Azamgarh). The 6-digit WhatsApp code is shown on screen in local dev / demo mode. New sellers: `/sell` → *Start selling* (identity check is simulated locally — Aadhaar `2345 6789 0124`, OTP `123456`). |
| Admin | `/admin` | `admin@plots.local` / `plots-admin-123` |

To create another admin: `ADMIN_PASSWORD='…' pnpm db:create-admin you@example.com "Your Name"`.

### Try the WhatsApp listing assistant without Meta

Open **/admin/whatsapp/simulator**. It's a phone-style chat that runs the real assistant: send `SELL`, answer the questions, attach photos and drop a pin. The plot then appears in **Admin → Review**. Approve it and it goes live on the site, and the seller's thread shows the "your plot is live" message.

Outside production with no WhatsApp credentials, every outgoing message goes to a dev outbox: it's printed in the terminal and recorded in the admin inbox.

## How it fits together

```text
Seller ──WhatsApp──▶ /api/whatsapp/webhook ─▶ listing assistant (src/server/whatsapp/bot.ts)
                                              └─▶ new Seller (Seller ID) + PENDING plot
Admin  ──/admin──▶ review queue ─▶ Approve ─▶ ACTIVE plot + "your plot is live" WhatsApp
Buyer  ──/, /search, /azamgarh, /property/…──▶ "Contact Seller on WhatsApp" ─▶ Enquiry row + wa.me chat
Seller ──/seller (Seller ID + WhatsApp code)──▶ dashboard: plots, enquiries, sold / still available
Cron   ──/api/cron/availability (daily)──▶ asks about stale plots, hides unanswered ones (never "sold")
```

Logins use the same approach as the shop project:

- **Sellers:** Seller ID or mobile → 6-digit code on WhatsApp. Codes are stored only as a scrypt hash, with a 45 s resend cooldown, at most 5 codes an hour and 5 attempts per code. Sessions are database-backed and the cookie holds an opaque token.
- **Admins:** email + password (scrypt), per-IP rate limit, database-backed session.

## Deploy (Vercel + Supabase)

1. **Database (Supabase):** in *Project → Connect*, copy the **transaction pooler** URI (port 6543) as `DATABASE_URL` and the **session pooler** URI (port 5432) as `DIRECT_URL`. Then, from your machine:
   ```bash
   DIRECT_URL="…:5432/postgres" DATABASE_URL="…:6543/postgres" pnpm exec prisma migrate deploy
   # optional demo data (Chandigarh + Azamgarh):
   SEED_ADMIN_PASSWORD="a-long-password" DIRECT_URL="…:5432/postgres" pnpm db:seed
   ```
2. **Photos (Vercel Blob):** create a Blob store and connect it to the project — it sets `BLOB_READ_WRITE_TOKEN`. Uploads then go to Blob automatically (`src/server/storage.ts`). Without it, uploads go to local disk (fine on a VM with a volume, not on Vercel).
3. **Environment variables** on Vercel: `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SITE_URL` (your domain), `CRON_SECRET`, `TRUSTED_IP_HEADER=x-real-ip`, `NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER`.
4. **Daily cron:** `vercel.json` calls `/api/cron/availability` once a day (Vercel Hobby allows daily crons; on Pro, run it hourly for an exact 24h reply window).
5. **Demo vs launch:** until WhatsApp and a KYC provider are connected, `DEMO_MODE=true` + `KYC_PROVIDER=mock` lets people try every flow (codes are shown on screen, identity check is simulated, and the site shows a "Demo site" banner). For the real launch set `DEMO_MODE` empty and connect:
   - **WhatsApp Cloud API**: `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, an Authentication template in `WHATSAPP_OTP_TEMPLATE_NAME`, webhook `https://<domain>/api/whatsapp/webhook` (subscribe to `messages`), and templates for messages outside the 24h window (`WHATSAPP_TEMPLATE_AVAILABILITY_CHECK`, `…_LISTING_LIVE`, `…_ENQUIRY_RECEIVED`, …).
   - **KYC provider**: implement `KycProvider` (`src/server/kyc/provider.ts`) for DigiLocker via Setu/Cashfree/Surepass and set `KYC_PROVIDER`.

## Scripts

| Script | Purpose |
| --- | --- |
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | Checks |
| `pnpm exec tsx scripts/check-whatsapp-parse.ts` | Self-check for the WhatsApp size/price/command parsers |
| `pnpm db:seed` | Reset demo data (dev only) |
| `pnpm db:studio` | Browse the database |
| `pnpm db:create-admin` | Create or update an admin |

Stack: Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · PostgreSQL · Prisma 7 · Leaflet/OpenStreetMap · sharp. Demo photos: Wikimedia Commons (see [docs/PHOTO_CREDITS.md](docs/PHOTO_CREDITS.md)).
