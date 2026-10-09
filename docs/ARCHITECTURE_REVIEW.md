# Architecture review — Oct 2026

Scope: the code in this repository, its Prisma schema and migrations, `vercel.json`/CI, and measurements taken locally. Production traffic, Supabase plan and Vercel settings were **not** visible; anything about them is marked "verify".

## 1. Verdict

The architecture fits the product: one Next.js app on Vercel plus Postgres, with no extra services. That's right for today and for well past the first tens of thousands of listings.

The real defects were in **consistency and operability**, not in the shape of the system. They are fixed below. Nothing here justifies Redis, a search engine, queues or microservices yet.

## 2. Findings

| # | Sev | Finding (evidence) | Fix | Status |
|---|---|---|---|---|
| A1 | **High** | **Listing status writes were read-then-write without a guard** (`service.ts`, `property.update({ where: { id } })`). Racing changes both "won". Example: the daily job hides a plot for "no reply" while the seller's YES arrives, so the plot ends hidden and the seller gets "unavailable" right after confirming. Ten concurrent "mark sold" calls each wrote and each emitted a sale event. | Compare-and-set on `(status, hiddenReason, availabilityCheckSentAt)`. The loser gets `conflict` and sends no notification. Admin and seller UIs say "refresh". | Fixed, tested (`check:integrity`: 10 concurrent → exactly 1 applied, 1 event) |
| A2 | **High** | **A suspended seller's plot could be made live again.** Approve, Unhide and "YES, available" had no seller check. Search would list a plot whose page 404s, with contact going to a suspended seller. | Rule in the single status writer: going live is refused for suspended sellers, on every path (admin, dashboard, WhatsApp). | Fixed, tested |
| A3 | Medium | **Listing edits weren't atomic.** Fields were saved first; photos and "back to Pending review" in a second step. A failure between them left a seller's edit live without re-review. The city geocoder also ran twice per save. | `updateListing` writes fields, photos and status in one transaction. The city is resolved once, outside it. | Fixed, tested (forced failure → full rollback) |
| A4 | Medium | **Slow external calls inside user requests.** The WhatsApp webhook processed messages (incl. photo download + re-encode) before answering Meta, which retries slow webhooks. Buyer enquiries waited for the seller's WhatsApp notification. | `after()`: answer first, work after the response (same function, same time budget). | Fixed |
| A5 | Medium | **No database pool limits or query timeouts.** The default pg pool was 10 per serverless instance with no statement timeout, so a spike or one slow query could exhaust Supabase pooler connections or hang a function until the platform kills it. | `DB_POOL_MAX` (prod default 5), 5 s connect wait, 15 s `statement_timeout`, all env-overridable. | Fixed. **Verify** that `DATABASE_URL` is the Supavisor *transaction* pooler (port 6543). |
| A6 | Medium | **The default sort had no usable index.** `status='ACTIVE' ORDER BY freshnessAt DESC NULLS LAST, publishedAt DESC, id` is used by search, home and city pages. At 50k plots (35k live): seq scan + sort, 10 ms, growing linearly. | Index `(status, freshnessAt DESC NULLS LAST, publishedAt DESC, id)`. | Fixed. Same test: index-only scan, **0.03 ms** (page 20: 0.06 ms). |
| A7 | Medium | **Thin observability.** Unstructured `console.*` calls, no record of unhandled server errors, no health endpoint, rate-limit hits invisible. | `log.ts` (structured, redacting), `onRequestError`, `/api/health`, `rate_limited` events. | Fixed |
| A8 | Medium | **Expiring data was only pruned opportunistically.** Sessions, OTPs and limiter rows could pile up on quiet days. | Daily prune in the existing cron. | Fixed, tested |
| A9 | Low | **Stale-while-revalidate after quiet periods.** A rarely visited ISR page can be served stale once after a long gap. On-demand revalidation covers every status change, so the only staleness is cosmetic (e.g. "confirmed 3 days ago"). | Accepted. | Documented |
| A10 | Low | **Search count is a scan of live rows** (7.9 ms at 35k). | Not needed yet; see triggers. | Deferred |
| A11 | Low | **Text search is `ILIKE '%q%'`** across title, locality, village and city (33 ms at 50k). | `pg_trgm` GIN indexes when triggered. | Deferred |

Verified as sound:
- Every protected action checks auth server-side (enumerated in SECURITY.md).
- Domain rules have one implementation each:
  - visibility: `listing-visibility.ts`
  - status: `changeListingStatus`
  - reports: `server/reports/*`
  - identity: `server/seller/onboarding.ts`
- Rate limits are shared across instances (Postgres).
- Webhook retries are idempotent (unique message id).
- Report submission is idempotent (unique `dedupeKey`).
- OTP consumption is guarded.
- Pagination is bounded everywhere.

## 3. Measurements (actually run)

Environment: MacBook, local Postgres 17 in Docker, `next start` production build. Not production numbers.

| What | Result |
|---|---|
| Page latency, seed data, c=10, 300 req | plot page p50 13 ms / p95 15 ms (ISR); search p50 82 ms / p95 98 ms; home and city 14 ms; 0 errors |
| Query plans, 50k synthetic plots (35k live), removed afterwards | default sort 10 → 0.03 ms; city+type 0.7 ms; price sort 0.2 ms; profile page 0.06 ms; profile count 0.36 ms; live count 7.9 ms; text search 33 ms |
| Mobile (emulated mid-range Android, 4× CPU, Slow 4G) | LCP home 1.5 s, plot 2.2 s, profile 2.4 s; CLS 0; INP-proxy 32–40 ms |
| Integrity | `check:integrity` 19/19, `check:security` 131/131, `check:http` 57/57, `check:profile` 44/44 |

## 4. Scaling roadmap

| Stage | Keep | Watch / likely limit | Trigger → action |
|---|---|---|---|
| **Launch** (hundreds of plots, low traffic) | Everything as is | Supabase Free limits; cold starts | — |
| **Growth** (1k–50k plots) | Same architecture | Pooler connections; Blob/image bandwidth; text-search latency | Pooler "max clients" errors or connection waits in logs → confirm transaction pooler, lower `DB_POOL_MAX`, upgrade the Supabase compute tier. Search p95 > 300 ms → add `pg_trgm` GIN on `title`/`locality`/`village`. |
| **Significant** (100k–500k plots, sustained concurrency) | Monolith, Postgres, ISR | `count(*)` per search; sitemap size (45k cap); analytics table size; image optimizer cost | Search count > 50 ms → cache counts per filter for 60 s, or show "1,000+". Sitemap > 45k → sitemap index. Analytics > ~10M rows → retention or monthly partitions. Vercel image costs up → pre-size at upload, serve Blob directly. |
| **Large** (millions, heavy search) | Postgres as source of truth | Faceted/fuzzy search, geo queries | Search features Postgres can't serve within p95 → evaluate a search index (Typesense/Meilisearch/OpenSearch), fed from Postgres. Background jobs beyond one daily cron → a queue (e.g. Vercel Queues or a Postgres job table). |

Watch these signals:
- p95 latency per route (Vercel Observability)
- 5xx rate
- `request.unhandled_error` count
- Supabase CPU and connection count
- slow-query log (`pg_stat_statements`)
- Blob and image bandwidth
- `rate_limited` volume

## 5. Remaining risks / not done

- `DEMO_MODE` (SECURITY.md C1) is still the largest risk.
- `DATABASE_URL` pooler mode, the Supabase backup plan and Vercel spend alerts: **verify** in the dashboards.
- No staging environment. Preview builds have no database. Load tests ran only locally.
- `audit_logs` covers admin actions. Seller and bot status changes are recorded as analytics events, not audit rows.
- Restoring a database backup can't roll back photos (Blob has no versioning). The app never deletes blobs.
