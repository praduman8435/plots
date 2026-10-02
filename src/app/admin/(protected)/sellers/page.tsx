import { SearchX, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BlockedBadge, IdentityBadge, OnboardingBadge, PhoneVerifiedBadge, SellerTypeBadge } from "@/components/admin/badges";
import { EmptyState } from "@/components/admin/empty-state";
import { formatDate } from "@/components/admin/format";
import { PageHeader } from "@/components/admin/page-header";
import { Pagination } from "@/components/admin/pagination";
import { PlotCounts } from "@/components/admin/plot-counts";
import { sellerSearchWhere } from "@/components/admin/search";
import { SearchBox } from "@/components/admin/search-box";
import type { ListingStatus } from "@/generated/prisma/enums";
import { requireAdmin } from "@/lib/admin/require";
import { db } from "@/lib/db";
import { formatPhone } from "@/lib/phone";

export const metadata: Metadata = { title: "Sellers" };

const PAGE_SIZE = 25;

export default async function AdminSellersPage({ searchParams }: PageProps<"/admin/sellers">) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q ?? "").slice(0, 100);
  const page = Math.max(1, Number.parseInt((Array.isArray(sp.page) ? sp.page[0] : sp.page) ?? "1", 10) || 1);
  const where = sellerSearchWhere(q) ?? {};

  const [total, sellers] = await Promise.all([
    db.seller.count({ where }),
    db.seller.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  const grouped = sellers.length
    ? await db.property.groupBy({ by: ["sellerId", "status"], where: { sellerId: { in: sellers.map((s) => s.id) } }, _count: { _all: true } })
    : [];
  const counts = new Map<string, Partial<Record<ListingStatus, number>>>();
  for (const g of grouped) {
    const c = counts.get(g.sellerId) ?? {};
    c[g.status] = g._count._all;
    counts.set(g.sellerId, c);
  }

  return (
    <>
      <PageHeader title="Sellers" description={`${total} seller${total === 1 ? "" : "s"}${q ? ` matching “${q}”` : " — owners and brokers"}.`} />
      <SearchBox action="/admin/sellers" defaultValue={q} placeholder="Search name, Seller ID or phone" />

      <div className="mt-5">
        {sellers.length === 0 ? (
          q ? (
            <EmptyState icon={SearchX} title={`No sellers match “${q}”`}>
              Try a Seller ID like SLR-7A41K2 or the last 4+ digits of their phone.
            </EmptyState>
          ) : (
            <EmptyState icon={Users} title="No sellers yet" />
          )
        ) : (
          <>
            <ul className="flex flex-col gap-3 lg:hidden">
              {sellers.map((s) => (
                <li key={s.id}>
                  <Link href={`/admin/sellers/${s.id}`} className="block rounded-2xl border border-line bg-white p-4 shadow-soft active:bg-mist">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{s.name}</p>
                        <p className="tabular text-sm text-muted">
                          {s.code} · {formatPhone(s.phone)}
                        </p>
                      </div>
                      <SellerTypeBadge type={s.sellerType} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <PhoneVerifiedBadge verified={Boolean(s.phoneVerifiedAt)} />
                      <IdentityBadge status={s.identityStatus} />
                      {!s.onboardedAt && <OnboardingBadge />}
                      {s.isBlocked && <BlockedBadge />}
                    </div>
                    <PlotCounts counts={counts.get(s.id) ?? {}} className="mt-2" />
                    <p className="mt-2 text-xs text-faint">
                      Joined {formatDate(s.createdAt)}
                      {s.identityVerifiedAt && <> · ID verified {formatDate(s.identityVerifiedAt)}{s.identityProvider ? ` via ${s.identityProvider}` : ""}</>}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-hidden rounded-2xl border border-line bg-white shadow-soft lg:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-mist/70 text-xs font-semibold tracking-wide text-muted uppercase">
                  <tr>
                    <th scope="col" className="py-3 pr-3 pl-4">Seller</th>
                    <th scope="col" className="px-3 py-3">Phone</th>
                    <th scope="col" className="px-3 py-3">Verification</th>
                    <th scope="col" className="px-3 py-3">Plots</th>
                    <th scope="col" className="py-3 pr-4 pl-3 text-right">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {sellers.map((s) => (
                    <tr key={s.id} className="group relative transition hover:bg-brand-50/40">
                      <td className="py-3 pr-3 pl-4">
                        <Link href={`/admin/sellers/${s.id}`} className="font-semibold text-ink after:absolute after:inset-0 group-hover:text-brand-800">
                          {s.name}
                        </Link>
                        <p className="tabular text-xs text-muted">{s.code}</p>
                      </td>
                      <td className="tabular px-3 py-3 whitespace-nowrap text-ink-soft">{formatPhone(s.phone)}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          <PhoneVerifiedBadge verified={Boolean(s.phoneVerifiedAt)} />
                          <IdentityBadge status={s.identityStatus} />
                          <SellerTypeBadge type={s.sellerType} />
                          {!s.onboardedAt && <OnboardingBadge />}
                          {s.isBlocked && <BlockedBadge />}
                        </div>
                        {s.identityVerifiedAt && (
                          <p className="mt-1 text-xs text-muted">
                            ID verified {formatDate(s.identityVerifiedAt)}
                            {s.identityProvider ? ` via ${s.identityProvider}` : ""}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <PlotCounts counts={counts.get(s.id) ?? {}} />
                      </td>
                      <td className="py-3 pr-4 pl-3 text-right text-xs whitespace-nowrap text-muted">{formatDate(s.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <Pagination basePath="/admin/sellers" params={{ q: q || undefined }} page={page} pageSize={PAGE_SIZE} total={total} />
      </div>
    </>
  );
}
