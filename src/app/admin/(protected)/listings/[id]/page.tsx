import { ArrowLeft, ArrowUpRight, CheckCircle2, ExternalLink, Eye, Flag, Inbox, MapPin, MessageCircle, PencilLine, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  BlockedBadge,
  EditedBadge,
  HIDDEN_REASON_LABELS,
  IdentityBadge,
  OnboardingBadge,
  PhoneVerifiedBadge,
  SourceBadge,
  StatusBadge,
} from "@/components/admin/badges";
import { ContactButtons } from "@/components/admin/contact-buttons";
import { now } from "@/components/admin/data";
import { DuplicateWarning } from "@/components/admin/duplicate-warning";
import { EmptyState } from "@/components/admin/empty-state";
import { EnquiryList } from "@/components/admin/enquiry-list";
import { daysSince, formatDate, formatDateTime, hoursLeft, landTypeLabel, timeAgo, timeAgoInline } from "@/components/admin/format";
import { StatusPanelActions } from "@/components/admin/listing-actions";
import { ListingThumb } from "@/components/admin/listing-thumb";
import { PageHeader } from "@/components/admin/page-header";
import { ListingForm } from "@/components/listing/listing-form";
import { ButtonLink } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin/require";
import { db } from "@/lib/db";
import { formatNumber, formatPrice } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { AREA_UNITS, formatArea, formatSqftHint } from "@/lib/units";
import type { ListingInput } from "@/lib/validation/listing";
import { updateListingAction } from "@/server/actions/admin/listings";
import { findPossibleDuplicates } from "@/server/listings/duplicates";
import { AVAILABILITY } from "@/server/listings/service";

export async function generateMetadata({ params }: PageProps<"/admin/listings/[id]">): Promise<Metadata> {
  const { id } = await params;
  const p = await db.property.findUnique({ where: { id }, select: { code: true } });
  return { title: p ? `Plot ${p.code}` : "Plot" };
}

const STATUS_EXPLAINERS = {
  PENDING: "Not visible to buyers yet. Check the photos, price and seller, then approve or reject.",
  ACTIVE: "Live — buyers can find and contact the seller.",
  HIDDEN: "Hidden from buyers. Nothing is lost; it can go live again.",
  SOLD: "Sold — kept for records, not shown in search.",
  REJECTED: "Not published. The seller was told why on WhatsApp.",
} as const;
const EDITED_EXPLAINER = "The seller edited this live listing, so it’s off the site until you approve the changes.";
const UNAVAILABLE_EXPLAINER = "Hidden because the seller didn’t answer the availability check within 24 hours. A YES (or Mark available) brings it back.";

export default async function AdminListingPage({ params, searchParams }: PageProps<"/admin/listings/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;

  const p = await db.property.findUnique({
    where: { id },
    include: {
      city: true,
      seller: { include: { conversation: { select: { id: true } }, _count: { select: { properties: true } } } },
      images: { orderBy: { position: "asc" } },
      enquiries: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, buyerName: true, buyerPhone: true, channel: true, source: true, createdAt: true },
      },
      _count: { select: { enquiries: true } },
    },
  });
  if (!p) notFound();

  const [cities, duplicates, reportCount] = await Promise.all([
    db.city.findMany({
      orderBy: [{ isLive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, state: true, bighaInSqft: true },
    }),
    findPossibleDuplicates(p.id),
    db.report.count({ where: { propertyId: p.id } }),
  ]);

  const at = now();
  const edited = p.status === "PENDING" && p.publishedAt !== null;
  const unavailable = p.status === "HIDDEN" && p.hiddenReason === "AVAILABILITY_UNCONFIRMED";
  const confirmedDays = daysSince(p.lastConfirmedAt, at);
  const sinceFreshDays = daysSince(p.lastConfirmedAt ?? p.publishedAt, at);
  const undelivered =
    p.status === "ACTIVE" &&
    !p.availabilityCheckSentAt &&
    p.lastAvailabilityCheckAt !== null &&
    (!p.freshnessAt || p.freshnessAt <= p.lastAvailabilityCheckAt);
  const checkEveryDays = AVAILABILITY.checkEveryMs / 86_400_000;
  const price = Number(p.price);
  const place = [p.village, p.locality, p.city.name].filter(Boolean).join(", ");
  const enquiryRows = p.enquiries.map((e) => ({
    ...e,
    property: { id: p.id, title: p.title, code: p.code, seller: { id: p.seller.id, name: p.seller.name, code: p.seller.code } },
  }));
  const banner = sp.created ? "Plot created." : sp.saved ? "Changes saved." : null;

  return (
    <>
      <PageHeader
        back={
          <Link href="/admin/listings" className="inline-flex h-9 items-center gap-1.5 text-sm font-medium text-muted hover:text-brand-700">
            <ArrowLeft className="size-4" aria-hidden /> Listings
          </Link>
        }
        title={p.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={p.status} hiddenReason={p.hiddenReason} removedAt={p.removedAt} size="sm" />
            {edited && <EditedBadge />}
            <SourceBadge source={p.source} />
            <span className="tabular font-medium text-ink-soft">{p.code}</span>
            <span>· Added {timeAgo(p.createdAt, at)}</span>
          </span>
        }
        actions={
          <>
            {reportCount > 0 && (
              <ButtonLink href={`/admin/reports?listing=${p.id}`} variant="secondary" size="sm" className="text-amber-800">
                <Flag /> {reportCount} report{reportCount === 1 ? "" : "s"}
              </ButtonLink>
            )}
            {p.status === "ACTIVE" && (
              <ButtonLink href={`/property/${p.slug}`} target="_blank" variant="secondary" size="sm">
                <ExternalLink /> Public page
              </ButtonLink>
            )}
            <ButtonLink href="#edit" variant="soft" size="sm">
              <PencilLine /> Edit
            </ButtonLink>
          </>
        }
      />

      {banner && (
        <div role="status" className="mb-5 flex items-center gap-2 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-medium text-brand-900">
          <CheckCircle2 className="size-4 text-brand-600" aria-hidden /> {banner}
        </div>
      )}

      {duplicates.length > 0 && <DuplicateWarning duplicates={duplicates} className="mb-5" />}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        {/* Photos */}
        <section aria-label="Photos" className="lg:col-start-1">
          {p.images.length === 0 ? (
            <ListingThumb url={null} alt="" sizes="100vw" className="aspect-[16/9] rounded-2xl border border-line" />
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {p.images.map((img, i) => (
                <a
                  key={img.id}
                  href={img.url}
                  target="_blank"
                  rel="noreferrer"
                  className={
                    i === 0
                      ? "relative col-span-4 aspect-[16/10] overflow-hidden rounded-2xl bg-mist"
                      : "relative aspect-square overflow-hidden rounded-xl bg-mist"
                  }
                >
                  <Image
                    src={img.url}
                    alt={`Photo ${i + 1} of ${p.title}`}
                    fill
                    sizes={i === 0 ? "(min-width: 1024px) 60vw, 100vw" : "(min-width: 1024px) 15vw, 25vw"}
                    className="object-cover transition hover:scale-[1.02]"
                    priority={i === 0}
                  />
                  {i === 0 && (
                    <span className="absolute top-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-ink shadow-soft">
                      Cover · {p.images.length} photo{p.images.length === 1 ? "" : "s"}
                    </span>
                  )}
                </a>
              ))}
            </div>
          )}
        </section>

        {/* Status + seller (right column on desktop, right after photos on phones) */}
        <aside className="flex flex-col gap-5 lg:col-start-2 lg:row-span-4 lg:row-start-1">
          <Card title="Status">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={p.status} hiddenReason={p.hiddenReason} removedAt={p.removedAt} />
              {edited && <EditedBadge />}
              {p.status === "HIDDEN" && p.hiddenReason && !unavailable && <span className="text-xs text-muted">{HIDDEN_REASON_LABELS[p.hiddenReason]}</span>}
            </div>
            <p className="text-sm text-ink-soft">{edited ? EDITED_EXPLAINER : unavailable ? UNAVAILABLE_EXPLAINER : STATUS_EXPLAINERS[p.status]}</p>
            {p.status === "REJECTED" && p.rejectionReason && (
              <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
                <span className="font-semibold">Reason:</span> {p.rejectionReason}
              </p>
            )}
            {(p.status === "ACTIVE" || unavailable) && (
              <div className="mt-3 rounded-xl bg-mist px-3 py-2.5 text-sm text-ink-soft">
                {p.status === "ACTIVE" && p.availabilityCheckSentAt ? (
                  <p>
                    Availability check delivered <strong className="font-semibold text-ink">{timeAgo(p.availabilityCheckSentAt, at)}</strong>, waiting for a
                    reply. <strong className="font-semibold text-amber-800">{hoursLeft(p.availabilityCheckSentAt, AVAILABILITY.replyWithinMs, at)} h left</strong>{" "}
                    before it’s hidden from buyers.
                  </p>
                ) : undelivered && p.lastAvailabilityCheckAt ? (
                  <p>
                    <strong className="font-semibold text-amber-800">Couldn’t reach the seller</strong> — the check {timeAgo(p.lastAvailabilityCheckAt, at)} wasn’t
                    delivered on WhatsApp. Call them, then mark it.
                  </p>
                ) : unavailable ? (
                  <p>
                    Hidden {timeAgo(p.updatedAt, at)}.
                    {p.lastConfirmedAt ? ` Seller last confirmed ${timeAgoInline(p.lastConfirmedAt, at)}.` : " Never confirmed by the seller."}
                  </p>
                ) : confirmedDays != null ? (
                  <p>
                    Seller last confirmed it’s available{" "}
                    <strong className="font-semibold text-ink">{confirmedDays === 0 ? "today" : timeAgoInline(p.lastConfirmedAt!, at)}</strong>
                    {confirmedDays >= checkEveryDays ? " — a weekly check is due." : "."}
                  </p>
                ) : (
                  <p>
                    Not confirmed by the seller yet{p.publishedAt ? ` — live since ${formatDate(p.publishedAt)}` : ""}.
                    {sinceFreshDays != null && sinceFreshDays >= checkEveryDays ? " A weekly check is due." : ""}
                  </p>
                )}
              </div>
            )}
            <div className="mt-4">
              <StatusPanelActions propertyId={p.id} status={p.status} hiddenReason={p.hiddenReason} />
            </div>
            {p.status === "ACTIVE" && (
              <Link
                href={`/property/${p.slug}`}
                target="_blank"
                className="mt-4 inline-flex h-11 items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"
              >
                View public page <ArrowUpRight className="size-4" aria-hidden />
              </Link>
            )}
          </Card>

          <Card title="Seller">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                <UserRound className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <Link href={`/admin/sellers/${p.seller.id}`} className="block truncate font-semibold text-ink hover:text-brand-700">
                  {p.seller.name}
                </Link>
                <p className="tabular text-sm text-muted">{p.seller.code}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <PhoneVerifiedBadge verified={Boolean(p.seller.phoneVerifiedAt)} />
                  <IdentityBadge status={p.seller.identityStatus} />
                  {!p.seller.onboardedAt && <OnboardingBadge />}
                  {p.seller.isBlocked && <BlockedBadge />}
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
              <span className="tabular text-[15px] font-semibold text-ink">{formatPhone(p.seller.phone)}</span>
              <ContactButtons phone={p.seller.phone} text={`Hi ${p.seller.name}, this is InstaPlots about your plot ${p.title} (${p.code}).`} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {p.seller.conversation ? (
                <ButtonLink href={`/admin/whatsapp/${p.seller.conversation.id}`} variant="secondary" size="sm" className="h-11 sm:h-9">
                  <MessageCircle /> Chat
                </ButtonLink>
              ) : (
                <span />
              )}
              <ButtonLink href={`/admin/sellers/${p.seller.id}`} variant="ghost" size="sm" className="h-11 sm:h-9">
                {p.seller._count.properties} plot{p.seller._count.properties === 1 ? "" : "s"} <ArrowUpRight />
              </ButtonLink>
            </div>
          </Card>
        </aside>

        {/* Facts */}
        <Card title="Details" className="lg:col-start-1">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
            <Fact label="Price">
              <span className="text-lg font-extrabold text-brand-800">{formatPrice(price)}</span>
              <span className="block text-xs text-muted">{p.priceNegotiable ? "Negotiable" : "Fixed price"}</span>
            </Fact>
            <Fact label="Size (as entered)">
              {formatArea(p.area, p.areaUnit)}
              <span className="block text-xs text-muted">{formatSqftHint(p.areaSqft, p.areaUnit)}</span>
            </Fact>
            <Fact label="Rate">
              {formatPrice(Math.round(price / p.area))} / {AREA_UNITS[p.areaUnit].short}
            </Fact>
            <Fact label="Land type">{landTypeLabel(p.landType)}</Fact>
            <Fact label="Location" className="col-span-2">
              <span className="flex items-start gap-1">
                <MapPin className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden />
                {place}, {p.city.state}
              </span>
              {p.latitude != null && p.longitude != null && (
                <a
                  href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex min-h-8 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
                >
                  Exact pin (admin only) <ArrowUpRight className="size-3.5" aria-hidden />
                </a>
              )}
            </Fact>
            <Fact label="Views">
              <span className="inline-flex items-center gap-1">
                <Eye className="size-4 text-faint" aria-hidden /> {formatNumber(p.viewCount)}
              </span>
            </Fact>
            <Fact label="Enquiries">{formatNumber(p._count.enquiries)}</Fact>
            <Fact label="Added">{formatDateTime(p.createdAt)}</Fact>
            <Fact label="Source">
              <SourceBadge source={p.source} size="md" />
            </Fact>
            {p.publishedAt && <Fact label="First published">{formatDate(p.publishedAt)}</Fact>}
            {p.soldAt && <Fact label="Sold">{formatDate(p.soldAt)}</Fact>}
          </dl>
          {p.features.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-1.5 border-t border-line pt-4">
              {p.features.map((f) => (
                <span key={f} className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800 ring-1 ring-brand-100">
                  {f}
                </span>
              ))}
            </div>
          )}
          <div className="mt-5 border-t border-line pt-4">
            <p className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Description</p>
            <p className="text-[15px] leading-relaxed whitespace-pre-line text-ink-soft">{p.description}</p>
          </div>
        </Card>

        {/* Enquiries */}
        <section aria-labelledby="enq" className="lg:col-start-1">
          <h2 id="enq" className="mb-3 text-lg font-bold text-ink">
            Enquiries <span className="tabular text-base font-semibold text-muted">{p._count.enquiries}</span>
          </h2>
          {enquiryRows.length === 0 ? (
            <EmptyState icon={Inbox} title="No enquiries yet" />
          ) : (
            <EnquiryList enquiries={enquiryRows} showProperty={false} showSeller={false} />
          )}
        </section>

        {/* Edit */}
        <section id="edit" aria-labelledby="edit-heading" className="scroll-mt-20 lg:col-start-1">
          <h2 id="edit-heading" className="mb-1 text-lg font-bold text-ink">
            Edit listing
          </h2>
          <p className="mb-4 text-sm text-muted">
            Fix details or photos (remove, add, reorder — the first photo is the cover). Saving doesn’t change the status or notify the seller.
          </p>
          <ListingForm
            mode="admin"
            cities={cities}
            submitLabel="Save changes"
            initial={{
              title: p.title,
              landType: p.landType,
              cityId: p.cityId,
              locality: p.locality,
              village: p.village ?? undefined,
              latitude: p.latitude ?? undefined,
              longitude: p.longitude ?? undefined,
              area: p.area,
              areaUnit: p.areaUnit,
              price,
              priceNegotiable: p.priceNegotiable,
              features: p.features as ListingInput["features"],
              description: p.description,
              images: p.images.map((img) => ({ url: img.url, width: img.width ?? 0, height: img.height ?? 0 })),
            }}
            action={updateListingAction.bind(null, p.id)}
          />
        </section>
      </div>
    </>
  );
}

function Card({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-white p-4 shadow-soft sm:p-5 ${className ?? ""}`}>
      <h2 className="mb-3 text-sm font-bold tracking-wide text-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Fact({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="tabular mt-0.5 text-[15px] font-semibold text-ink">{children}</dd>
    </div>
  );
}
