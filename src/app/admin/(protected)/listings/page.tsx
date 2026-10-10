import { MapPinned, Plus, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EditedBadge, SourceBadge, StatusBadge } from "@/components/admin/badges";
import { EmptyState } from "@/components/admin/empty-state";
import { timeAgo } from "@/components/admin/format";
import { ListingThumb } from "@/components/admin/listing-thumb";
import { PageHeader } from "@/components/admin/page-header";
import { ReviewCard } from "@/components/admin/review-card";
import { Pagination } from "@/components/admin/pagination";
import { SearchBox } from "@/components/admin/search-box";
import { listingSearchWhere } from "@/components/admin/search";
import { ButtonLink } from "@/components/ui/button";
import type { Prisma } from "@/generated/prisma/client";
import type { ListingStatus } from "@/generated/prisma/enums";
import { requireAdmin } from "@/lib/admin/require";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { formatArea } from "@/lib/units";
import { loadReviewQueue } from "@/server/admin/review";

export const metadata: Metadata = { title: "Listings" };

const PAGE_SIZE = 20;
/** Filter tabs. HIDDEN is split: "Unavailable (no reply)" vs other hidden plots. */
type Filter = ListingStatus | "UNAVAILABLE";
const TABS: { status?: Filter; label: string }[] = [
  { label: "All" },
  { status: "PENDING", label: "Pending approval" },
  { status: "ACTIVE", label: "Live" },
  { status: "UNAVAILABLE", label: "Unavailable (no reply)" },
  { status: "HIDDEN", label: "Hidden" },
  { status: "SOLD", label: "Sold" },
  { status: "REJECTED", label: "Rejected" },
];
const FILTERS = new Set<string>(["PENDING", "ACTIVE", "UNAVAILABLE", "HIDDEN", "SOLD", "REJECTED"]);

function filterWhere(f: Filter | undefined): Prisma.PropertyWhereInput {
  if (!f) return {};
  if (f === "UNAVAILABLE") return { status: "HIDDEN", hiddenReason: "AVAILABILITY_UNCONFIRMED" };
  if (f === "HIDDEN") return { status: "HIDDEN", OR: [{ hiddenReason: null }, { hiddenReason: { not: "AVAILABILITY_UNCONFIRMED" } }] };
  return { status: f };
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AdminListingsPage({ searchParams }: PageProps<"/admin/listings">) {
  await requireAdmin();
  const sp = await searchParams;
  const rawStatus = one(sp.status);
  const status = rawStatus && FILTERS.has(rawStatus) ? (rawStatus as Filter) : undefined;
  const q = (one(sp.q) ?? "").slice(0, 100);
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1);

  const search = listingSearchWhere(q);
  const where: Prisma.PropertyWhereInput = { AND: [filterWhere(status), search ?? {}] };
  const reviewing = status === "PENDING";

  const [grouped, total, listings, queue] = await Promise.all([
    db.property.groupBy({ by: ["status", "hiddenReason"], where: search ?? {}, _count: { _all: true } }),
    db.property.count({ where }),
    // Pending: review cards, oldest first. Everything else: a compact list, newest first.
    reviewing
      ? Promise.resolve([])
      : db.property.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          include: {
            city: { select: { name: true } },
            seller: { select: { id: true, name: true, code: true } },
            images: { orderBy: { position: "asc" }, take: 1, select: { url: true } },
            _count: { select: { enquiries: true } },
          },
        }),
    reviewing ? loadReviewQueue({ where: search, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }) : Promise.resolve([]),
  ]);
  const counts: Partial<Record<Filter, number>> = {};
  for (const g of grouped) {
    const key: Filter = g.status === "HIDDEN" && g.hiddenReason === "AVAILABILITY_UNCONFIRMED" ? "UNAVAILABLE" : g.status;
    counts[key] = (counts[key] ?? 0) + g._count._all;
  }
  const all = grouped.reduce((n, g) => n + g._count._all, 0);
  const tabHref = (s?: Filter) => {
    const p = new URLSearchParams();
    if (s) p.set("status", s);
    if (q) p.set("q", q);
    const str = p.toString();
    return str ? `/admin/listings?${str}` : "/admin/listings";
  };

  return (
    <>
      <PageHeader
        title={reviewing ? "Review queue" : "Listings"}
        description={reviewing ? "Oldest first. Check photos, price and seller, then approve or reject." : "Every plot on InstaPlots, newest first."}
        actions={
          <ButtonLink href="/admin/listings/new" className="hidden lg:inline-flex">
            <Plus /> Add plot
          </ButtonLink>
        }
      />

      <div className="flex flex-col gap-4">
        <SearchBox
          action="/admin/listings"
          defaultValue={q}
          placeholder="Search plot code, title, place, seller, Seller ID or phone"
          hidden={{ status }}
        />
        <nav aria-label="Status" className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex w-max gap-2">
            {TABS.map((t) => {
              const active = t.status === status;
              const count = t.status ? (counts[t.status] ?? 0) : all;
              return (
                <li key={t.label}>
                  <Link
                    href={tabHref(t.status)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition",
                      active ? "border-brand-950 bg-brand-950 text-white" : "border-line-strong bg-white text-ink-soft hover:border-brand-300",
                    )}
                  >
                    {t.label}
                    <span
                      className={cn(
                        "tabular rounded-full px-1.5 text-xs",
                        active ? "bg-white/15 text-white" : t.status === "PENDING" && count > 0 ? "bg-amber-100 text-amber-800" : "bg-mist text-muted",
                      )}
                    >
                      {count}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <div className="mt-5">
        {reviewing && queue.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {queue.map((p) => (
              <ReviewCard key={p.id} p={p} />
            ))}
          </div>
        ) : (reviewing ? queue.length === 0 : listings.length === 0) ? (
          q ? (
            <EmptyState icon={SearchX} title={`No plots match “${q}”`}>
              Try a plot code like P-7Q2M4K, a Seller ID like SLR-7A41K2, a village name or the last digits of a phone number.
            </EmptyState>
          ) : (
            <EmptyState icon={MapPinned} title={reviewing ? "Nothing to review" : "No plots here yet"} />
          )
        ) : (
          <>
            {/* Phones: cards */}
            <ul className="flex flex-col gap-3 lg:hidden">
              {listings.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/admin/listings/${p.id}`}
                    className="flex gap-3 rounded-2xl border border-line bg-white p-3 shadow-soft transition active:bg-mist"
                  >
                    <ListingThumb url={p.images[0]?.url} alt="" sizes="96px" className="size-24 shrink-0 rounded-xl" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={p.status} hiddenReason={p.hiddenReason} removedAt={p.removedAt} size="sm" />
                        {p.status === "PENDING" && p.publishedAt && <EditedBadge short />}
                        <span className="tabular ml-auto text-[11px] font-medium text-faint">{p.code}</span>
                      </div>
                      <p className="line-clamp-2 text-[15px] leading-snug font-semibold text-ink">{p.title}</p>
                      <p className="tabular text-sm">
                        <span className="font-bold text-brand-800">{formatPrice(p.price)}</span>
                        <span className="text-muted"> · {p.city.name}</span>
                      </p>
                      <p className="truncate text-xs text-muted">
                        {p.seller.name} · {p.seller.code} · {timeAgo(p.createdAt)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {/* Desktop: dense table */}
            <div className="hidden overflow-hidden rounded-2xl border border-line bg-white shadow-soft lg:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-mist/70 text-xs font-semibold tracking-wide text-muted uppercase">
                  <tr>
                    <th scope="col" className="py-3 pr-3 pl-4">Plot</th>
                    <th scope="col" className="px-3 py-3">Price · size</th>
                    <th scope="col" className="px-3 py-3">Seller</th>
                    <th scope="col" className="px-3 py-3">Status</th>
                    <th scope="col" className="px-3 py-3 text-right">Enquiries</th>
                    <th scope="col" className="py-3 pr-4 pl-3 text-right">Added</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {listings.map((p) => (
                    <tr key={p.id} className="group relative transition hover:bg-brand-50/40">
                      <td className="py-2.5 pr-3 pl-4">
                        <div className="flex items-center gap-3">
                          <ListingThumb url={p.images[0]?.url} alt="" sizes="64px" className="h-12 w-16 shrink-0 rounded-lg" />
                          <div className="min-w-0 max-w-[22rem]">
                            <Link href={`/admin/listings/${p.id}`} className="block truncate font-semibold text-ink after:absolute after:inset-0 group-hover:text-brand-800">
                              {p.title}
                            </Link>
                            <p className="truncate text-xs text-muted">
                              <span className="tabular">{p.code}</span> · {p.locality}, {p.city.name}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="tabular px-3 py-2.5 whitespace-nowrap">
                        <p className="font-bold text-brand-800">{formatPrice(p.price)}</p>
                        <p className="text-xs text-muted">{formatArea(p.area, p.areaUnit)}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="max-w-40 truncate font-medium text-ink">{p.seller.name}</p>
                        <p className="tabular text-xs text-muted">{p.seller.code}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge status={p.status} hiddenReason={p.hiddenReason} removedAt={p.removedAt} size="sm" />
                          {p.status === "PENDING" && p.publishedAt && <EditedBadge short />}
                          <SourceBadge source={p.source} />
                        </div>
                      </td>
                      <td className="tabular px-3 py-2.5 text-right font-medium text-ink-soft">{p._count.enquiries}</td>
                      <td className="py-2.5 pr-4 pl-3 text-right text-xs whitespace-nowrap text-muted">{timeAgo(p.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <Pagination basePath="/admin/listings" params={{ status, q: q || undefined }} page={page} pageSize={PAGE_SIZE} total={total} />
      </div>
    </>
  );
}
