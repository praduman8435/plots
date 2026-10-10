import { ArrowLeft, Flag, Inbox, MapPinned, MessageCircle, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlockedBadge, EditedBadge, IdentityBadge, OnboardingBadge, PhoneVerifiedBadge, StatusBadge } from "@/components/admin/badges";
import { BlockSellerButton } from "@/components/admin/block-seller-button";
import { ContactButtons } from "@/components/admin/contact-buttons";
import { EmptyState } from "@/components/admin/empty-state";
import { EnquiryList } from "@/components/admin/enquiry-list";
import { formatDate, timeAgo } from "@/components/admin/format";
import { ListingThumb } from "@/components/admin/listing-thumb";
import { PageHeader } from "@/components/admin/page-header";
import { PlotCounts } from "@/components/admin/plot-counts";
import { ButtonA, ButtonLink } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/ui/icons";
import type { ListingStatus } from "@/generated/prisma/enums";
import { requireAdmin } from "@/lib/admin/require";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { formatArea } from "@/lib/units";
import { waLink } from "@/lib/whatsapp-links";

export async function generateMetadata({ params }: PageProps<"/admin/sellers/[id]">): Promise<Metadata> {
  const { id } = await params;
  const s = await db.seller.findUnique({ where: { id }, select: { name: true } });
  return { title: s ? s.name : "Seller" };
}

export default async function AdminSellerPage({ params }: PageProps<"/admin/sellers/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const seller = await db.seller.findUnique({
    where: { id },
    include: {
      conversation: { select: { id: true, unreadCount: true, step: true } },
      properties: {
        orderBy: { createdAt: "desc" },
        include: {
          city: { select: { name: true } },
          images: { orderBy: { position: "asc" }, take: 1, select: { url: true } },
          _count: { select: { enquiries: true } },
        },
      },
    },
  });
  if (!seller) notFound();

  const [enquiries, enquiryTotal, reportCount] = await Promise.all([
    db.enquiry.findMany({
      where: { property: { sellerId: seller.id } },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { property: { select: { id: true, title: true, code: true } } },
    }),
    db.enquiry.count({ where: { property: { sellerId: seller.id } } }),
    db.report.count({ where: { sellerId: seller.id } }),
  ]);
  const enquiryRows = enquiries.map((e) => ({
    ...e,
    property: { ...e.property, seller: { id: seller.id, name: seller.name, code: seller.code } },
  }));
  const counts: Partial<Record<ListingStatus, number>> = {};
  for (const p of seller.properties) counts[p.status] = (counts[p.status] ?? 0) + 1;
  const addPlotHref = `/admin/listings/new?phone=${encodeURIComponent(seller.phone)}`;

  return (
    <>
      <PageHeader
        back={
          <Link href="/admin/sellers" className="inline-flex h-9 items-center gap-1.5 text-sm font-medium text-muted hover:text-brand-700">
            <ArrowLeft className="size-4" aria-hidden /> Sellers
          </Link>
        }
        title={seller.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="tabular font-semibold text-ink-soft">{seller.code}</span>
            <PhoneVerifiedBadge verified={Boolean(seller.phoneVerifiedAt)} />
            <IdentityBadge status={seller.identityStatus} />
            {!seller.onboardedAt && <OnboardingBadge />}
            {seller.isBlocked && <BlockedBadge />}
          </span>
        }
        actions={
          <>
            {reportCount > 0 && (
              <ButtonLink href={`/admin/reports?seller=${seller.id}`} variant="secondary" size="sm" className="h-11 text-amber-800 sm:h-9">
                <Flag /> {reportCount} report{reportCount === 1 ? "" : "s"}
              </ButtonLink>
            )}
            <ButtonLink href={addPlotHref} size="sm" className="h-11 sm:h-9">
              <Plus /> Add plot for this seller
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
        <aside className="flex flex-col gap-5">
          <section className="rounded-2xl border border-line bg-white p-4 shadow-soft sm:p-5">
            <h2 className="mb-3 text-sm font-bold tracking-wide text-muted uppercase">Contact</h2>
            <div className="flex items-center justify-between gap-3">
              <span className="tabular text-lg font-bold text-ink">{formatPhone(seller.phone)}</span>
              <ContactButtons phone={seller.phone} text={`Hi ${seller.name}, this is InstaPlots.`} />
            </div>
            <div className="mt-4">
              {seller.conversation ? (
                <ButtonLink href={`/admin/whatsapp/${seller.conversation.id}`} variant="secondary" className="w-full">
                  <MessageCircle /> Open WhatsApp chat
                  {seller.conversation.unreadCount > 0 && (
                    <span className="tabular rounded-full bg-brand-600 px-1.5 text-xs text-white">{seller.conversation.unreadCount}</span>
                  )}
                </ButtonLink>
              ) : (
                <ButtonA href={waLink(seller.phone, `Hi ${seller.name}, this is InstaPlots.`)} target="_blank" rel="noreferrer" variant="secondary" className="w-full">
                  <WhatsAppIcon /> Message on WhatsApp
                </ButtonA>
              )}
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm">
              <div>
                <dt className="text-xs text-muted">Joined</dt>
                <dd className="font-semibold text-ink">{formatDate(seller.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Phone verified</dt>
                <dd className="font-semibold text-ink">{seller.phoneVerifiedAt ? formatDate(seller.phoneVerifiedAt) : "Not yet"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Seller ID</dt>
                <dd className="tabular font-semibold text-ink">{seller.code}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Sign-up</dt>
                <dd className="font-semibold text-ink">{seller.onboardedAt ? `Finished ${formatDate(seller.onboardedAt)}` : "Unfinished"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Plots</dt>
                <dd className="font-semibold text-ink">{seller.properties.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Enquiries received</dt>
                <dd className="font-semibold text-ink">{enquiryTotal}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-line bg-white p-4 shadow-soft sm:p-5">
            <h2 className="mb-3 text-sm font-bold tracking-wide text-muted uppercase">Identity</h2>
            <IdentityBadge status={seller.identityStatus} size="md" />
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-muted">Verified on</dt>
                <dd className="font-semibold text-ink">{seller.identityVerifiedAt ? formatDate(seller.identityVerifiedAt) : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Provider</dt>
                <dd className="font-semibold text-ink">{seller.identityProvider ?? "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-muted">ID number (masked, admin only)</dt>
                <dd className="tabular font-semibold tracking-wide text-ink">{seller.identityMasked ?? "—"}</dd>
              </div>
              {seller.identityReference && (
                <div className="col-span-2">
                  <dt className="text-xs text-muted">Provider reference</dt>
                  <dd className="tabular truncate font-medium text-ink-soft">{seller.identityReference}</dd>
                </div>
              )}
            </dl>
            <p className="mt-3 text-xs text-muted">
              {seller.sellerType === "OWNER" ? "Owner status is self-declared — identity verification doesn’t prove ownership." : "Self-declared broker."}
            </p>
          </section>

          <section className="rounded-2xl border border-line bg-white p-4 shadow-soft sm:p-5">
            <h2 className="mb-1 text-sm font-bold tracking-wide text-muted uppercase">Access</h2>
            <p className="mb-3 text-sm text-ink-soft">
              {seller.isBlocked
                ? "Blocked — can't sign in to the seller portal. Their plots stay hidden until you unhide them."
                : "Blocking signs them out and hides their live plots. Use for fraud or repeated fake listings."}
            </p>
            <BlockSellerButton sellerId={seller.id} isBlocked={seller.isBlocked} />
          </section>
        </aside>

        <div className="flex min-w-0 flex-col gap-8">
          <section aria-labelledby="plots">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="plots" className="text-lg font-bold text-ink">
                Plots
              </h2>
              <PlotCounts counts={counts} />
            </div>
            {seller.properties.length === 0 ? (
              <EmptyState icon={MapPinned} title="No plots yet">
                <Link href={addPlotHref} className="font-semibold text-brand-700 hover:underline">
                  Add their first plot
                </Link>
              </EmptyState>
            ) : (
              <ul className="flex flex-col gap-3">
                {seller.properties.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/admin/listings/${p.id}`}
                      className="flex gap-3 rounded-2xl border border-line bg-white p-3 shadow-soft transition hover:shadow-card active:bg-mist"
                    >
                      <ListingThumb url={p.images[0]?.url} alt="" sizes="96px" className="size-20 shrink-0 rounded-xl sm:h-20 sm:w-28" />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={p.status} hiddenReason={p.hiddenReason} removedAt={p.removedAt} size="sm" />
                          {p.status === "PENDING" && p.publishedAt && <EditedBadge short />}
                          <span className="tabular ml-auto text-[11px] font-medium text-faint">{p.code}</span>
                        </div>
                        <p className="truncate font-semibold text-ink">{p.title}</p>
                        <p className="tabular truncate text-sm text-muted">
                          <span className="font-bold text-brand-800">{formatPrice(p.price)}</span> · {formatArea(p.area, p.areaUnit)} · {p.city.name} ·{" "}
                          {p._count.enquiries} enquir{p._count.enquiries === 1 ? "y" : "ies"} · {timeAgo(p.createdAt)}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="enqs">
            <h2 id="enqs" className="mb-3 text-lg font-bold text-ink">
              Enquiries received <span className="tabular text-base font-semibold text-muted">{enquiryTotal}</span>
            </h2>
            {enquiryRows.length === 0 ? (
              <EmptyState icon={Inbox} title="No enquiries yet" />
            ) : (
              <EnquiryList enquiries={enquiryRows} showSeller={false} />
            )}
          </section>
        </div>
      </div>
    </>
  );
}
