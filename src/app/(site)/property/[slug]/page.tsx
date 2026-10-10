import { BadgeCheck, Check, Fingerprint, Info, MapPin, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApproxMap } from "@/components/listing/approx-map";
import { approximateLocation } from "@/lib/approximate-location";
import { ContactActions } from "@/components/listing/contact-actions";
import { BackButton, ShareButton, ViewBeacon } from "@/components/listing/detail-client";
import { Gallery } from "@/components/listing/gallery";
import { PropertyCard } from "@/components/listing/property-card";
import { ReportSheet } from "@/components/report/report-sheet";
import { ButtonLink } from "@/components/ui/button";
import { formatPrice, formatRelativeDate } from "@/lib/format";
import { freshnessLabel } from "@/lib/freshness";
import { LAND_TYPES, LAND_TYPE_SLUGS, formatPricePerUnit, placeName } from "@/lib/land";
import { isPubliclyViewable } from "@/lib/listing-visibility";
import { sellerLabel } from "@/lib/seller-label";
import { sellerProfilePath } from "@/lib/seller-profile";
import { defaultShareImage, ogBase, site } from "@/lib/site";
import { AREA_UNITS, formatArea, formatSqftHint } from "@/lib/units";
import { getListingBySlug, getSimilarListings } from "@/server/listings/queries";

export const revalidate = 60;

/**
 * No paths at build time; each plot page is rendered on its first visit and
 * then served from cache (refreshed every 60s, and immediately via
 * revalidatePath when its status changes). Without this the route rendered on
 * every request. Nothing on the page is per-visitor (contact, report and view
 * counting all happen in the browser), so a shared cache is safe.
 */
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata(props: PageProps<"/property/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const p = await getListingBySlug(slug);
  if (!p || !isPubliclyViewable(p)) return { title: "Property not found" };
  const where = `${placeName(p)}, ${p.city.name}`;
  const description = `${formatArea(p.area, p.areaUnit)} ${LAND_TYPES[p.landType].label.toLowerCase()} for sale near ${where} — ${formatPrice(p.price)}. ${p.description.slice(0, 110)}`;
  const images = p.images[0] ? [{ url: p.images[0].url, width: p.images[0].width ?? 1600, height: p.images[0].height ?? 1200 }] : [defaultShareImage];
  return {
    title: `${formatArea(p.area, p.areaUnit)} ${LAND_TYPES[p.landType].label} for sale in ${where} — ${formatPrice(p.price)}`,
    description,
    alternates: { canonical: `/property/${p.slug}` },
    robots: { index: p.status === "ACTIVE" },
    openGraph: {
      ...ogBase,
      type: "website",
      url: `/property/${p.slug}`,
      title: `${formatPrice(p.price)} · ${formatArea(p.area, p.areaUnit)} ${LAND_TYPES[p.landType].label} · ${where}`,
      description,
      images,
    },
    twitter: { card: "summary_large_image", images },
  };
}

export default async function PropertyPage(props: PageProps<"/property/[slug]">) {
  const { slug } = await props.params;
  const p = await getListingBySlug(slug);
  if (!p || !isPubliclyViewable(p)) notFound();

  const available = p.status === "ACTIVE";
  const similar = await getSimilarListings(p);
  const perUnit = formatPricePerUnit(p.price, p.area, p.areaUnit);
  const listed = p.publishedAt ?? p.createdAt;
  const fresh = freshnessLabel(p);
  const plotRef = { id: p.id, code: p.code, slug: p.slug, title: p.title };
  const where = `${placeName(p)}, ${p.city.name}`;
  const sqftHint = formatSqftHint(p.areaSqft, p.areaUnit);
  const identityVerified = p.seller.identityStatus === "VERIFIED";
  const approx = p.latitude != null && p.longitude != null ? approximateLocation(p.latitude, p.longitude, p.id) : null;

  const perUnitPrice = p.area ? formatPrice(Math.round(Number(p.price) / p.area)) : null;
  const unitShort = AREA_UNITS[p.areaUnit].short;
  const priceTerms = p.priceNegotiable ? "Negotiable" : "Fixed price";
  const nearBy = `Near ${p.village || p.locality}, ${p.city.name}${p.city.state !== p.city.name ? `, ${p.city.state}` : ""}`;

  const details: { label: string; value: string; sub?: string }[] = [
    { label: "Land type", value: LAND_TYPES[p.landType].label },
    { label: "Land size", value: formatArea(p.area, p.areaUnit), sub: sqftHint ?? undefined },
    { label: "Asking price", value: formatPrice(p.price), sub: priceTerms },
    ...(perUnit ? [{ label: "Price per unit", value: perUnit }] : []),
    { label: "Listed on", value: listed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) },
    ...(p.lastConfirmedAt ? [{ label: "Seller confirmed", value: formatRelativeDate(p.lastConfirmedAt) }] : []),
    { label: "Property ID", value: p.code, sub: "Mention it when you call" },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: p.title,
    description: p.description,
    url: `${site.url}/property/${p.slug}`,
    datePosted: listed.toISOString(),
    image: p.images.map((i) => (/^https?:\/\//.test(i.url) ? i.url : `${site.url}${i.url}`)),
    offers: { "@type": "Offer", price: Number(p.price), priceCurrency: "INR", availability: available ? "https://schema.org/InStock" : "https://schema.org/SoldOut" },
    contentLocation: { "@type": "Place", name: where, address: { "@type": "PostalAddress", addressLocality: placeName(p), addressRegion: p.city.state, addressCountry: "IN" } },
  };

  // "Other" land has no city + type page, so it links to the city instead.
  const typePath = p.landType === "OTHER" ? null : `/${p.city.slug}/${LAND_TYPE_SLUGS[p.landType]}`;
  const similarPath = typePath ?? `/${p.city.slug}`;
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { name: "Home", url: site.url },
      { name: p.city.name, url: `${site.url}/${p.city.slug}` },
      ...(typePath ? [{ name: LAND_TYPES[p.landType].label, url: `${site.url}${typePath}` }] : []),
      { name: p.title, url: `${site.url}/property/${p.slug}` },
    ].map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.url })),
  };

  return (
    <article className="pb-32 md:pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([jsonLd, breadcrumbLd]).replace(/</g, "\\u003c") }} />
      <ViewBeacon id={p.id} />

      <nav aria-label="Breadcrumb" className="container-page hidden pt-6 text-sm text-muted md:block">
        <ol className="flex items-center gap-2">
          <li><Link href="/" className="hover:text-ink">Home</Link></li>
          <li aria-hidden>/</li>
          <li><Link href={`/${p.city.slug}`} className="hover:text-ink">{p.city.name}</Link></li>
          {typePath && (
            <>
              <li aria-hidden>/</li>
              <li><Link href={typePath} className="hover:text-ink">{LAND_TYPES[p.landType].label}</Link></li>
            </>
          )}
        </ol>
      </nav>

      {/* Photos */}
      <div className="md:container-page md:pt-4">
        <Gallery
          images={p.images}
          title={p.title}
          overlay={
            <div className="absolute inset-x-0 top-0 flex justify-between p-4">
              <BackButton className="flex size-10 items-center justify-center rounded-full bg-white/90 text-ink shadow-soft backdrop-blur" />
              <ShareButton title={p.title} className="flex size-10 items-center justify-center rounded-full bg-white/90 text-ink shadow-soft backdrop-blur" />
            </div>
          }
        />
      </div>

      <div className="container-page relative -mt-5 grid gap-10 md:mt-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
        <div className="-mx-4 min-w-0 rounded-t-[1.5rem] bg-white px-4 pt-5 sm:-mx-6 sm:px-6 md:mx-0 md:rounded-none md:px-0 md:pt-0">
          {!available && (
            <div className="mb-5 flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-100">
              <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">{p.status === "SOLD" ? "This property has been sold" : "This property is not available right now"}</p>
                <p className="mt-0.5 text-sm text-amber-800">See similar land below.</p>
              </div>
            </div>
          )}

          {/* Summary: what, where, how much */}
          <header>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-semibold">
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-brand-800 ring-1 ring-brand-100">{LAND_TYPES[p.landType].short}</span>
              {available && (
                <span className={`inline-flex items-center gap-1.5 ${fresh.fresh ? "text-brand-700" : "text-muted"}`}>
                  {fresh.fresh && <span className="size-1.5 rounded-full bg-brand-500" aria-hidden />}
                  {fresh.text}
                </span>
              )}
            </div>
            <h1 className="mt-3 text-xl leading-snug font-bold tracking-tight text-ink sm:text-2xl">
              {formatArea(p.area, p.areaUnit)} {LAND_TYPES[p.landType].label.toLowerCase()}
            </h1>
            <p className="mt-1 flex items-start gap-1.5 text-sm text-muted">
              <MapPin className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
              <span>{nearBy}</span>
            </p>

            <div className="mt-5 flex items-end justify-between gap-4 lg:hidden">
              <div>
                <p className="text-xs font-medium text-muted">Asking price</p>
                <p className="tabular mt-0.5 text-[1.625rem] leading-tight font-bold tracking-tight text-ink sm:text-[1.75rem]">{formatPrice(p.price)}</p>
              </div>
              <span className={`mb-1 rounded-full px-2.5 py-1 text-xs font-semibold ${p.priceNegotiable ? "bg-brand-50 text-brand-800 ring-1 ring-brand-100" : "bg-mist text-ink-soft ring-1 ring-line"}`}>
                {priceTerms}
              </span>
            </div>

            <dl className="mt-4 grid grid-cols-3 divide-x divide-line rounded-2xl bg-white ring-1 ring-line">
              <Fact label="Size" value={formatArea(p.area, p.areaUnit)} sub={sqftHint ?? undefined} />
              <Fact label={`Per ${unitShort}`} value={perUnitPrice ?? "—"} />
              <Fact label="Property ID" value={p.code} />
            </dl>
          </header>

          <Section title="About this land" className="mt-8">
            <p className="text-[15px] leading-7 whitespace-pre-line text-ink-soft">{p.description}</p>
            {p.features.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {p.features.map((f) => (
                  <li key={f} className="inline-flex items-center gap-1.5 rounded-full bg-mist px-3 py-1.5 text-[13px] font-medium text-ink-soft ring-1 ring-line">
                    <Check className="size-3.5 text-brand-600" aria-hidden /> {f}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Seller">
            <SellerCard seller={p.seller} identityVerified={identityVerified} />
          </Section>

          <Section title="Details">
            <dl className="divide-y divide-line">
              {details.map((d) => (
                <div key={d.label} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <dt className="text-sm text-muted">{d.label}</dt>
                  <dd className="text-right">
                    <span className="tabular text-sm font-semibold text-ink">{d.value}</span>
                    {d.sub && <span className="mt-0.5 block text-xs text-muted">{d.sub}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section title="Location">
            <p className="-mt-1 mb-3 text-sm text-muted">{nearBy}</p>
            <div className="overflow-hidden rounded-2xl ring-1 ring-line">
              {approx ? (
                <div className="relative z-0 h-60 sm:h-80">
                  <ApproxMap lat={approx.lat} lng={approx.lng} label={where} />
                </div>
              ) : (
                <div className="flex h-36 flex-col items-center justify-center gap-2 bg-mist text-center">
                  <MapPin className="size-6 text-brand-600" aria-hidden />
                  <p className="text-sm font-semibold">{where}</p>
                </div>
              )}
              <p className="flex items-start gap-2 bg-white px-4 py-3 text-[13px] text-muted">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                Approximate location. The seller shares the exact spot when you contact them.
              </p>
            </div>
          </Section>

          <Section title="Buy safely" icon={<ShieldAlert className="size-[18px] text-brand-600" aria-hidden />}>
            <ul className="space-y-2.5 text-sm leading-relaxed text-ink-soft">
              {[
                "Visit the land and check the ownership papers (khatauni, registry) before you pay or sign anything.",
                "Never send money just because you saw a listing online.",
                "Confirm the size, boundaries and price yourself before you decide.",
              ].map((tip) => (
                <li key={tip} className="flex gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /> {tip}
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <ReportSheet
                target="LISTING"
                targetRef={p.id}
                notice={p.status === "SOLD" ? "This property is already marked as sold." : !available ? "This property is already marked as not available." : undefined}
                hideReasons={available ? [] : ["PROPERTY_SOLD"]}
              />
            </div>
          </Section>
        </div>

        {/* Desktop contact panel */}
        <aside className="hidden lg:block">
          <div className="sticky top-28 space-y-3">
            <div className="rounded-3xl border border-line bg-white p-6 shadow-card">
              <p className="text-xs font-medium text-muted">Asking price</p>
              <div className="mt-0.5 flex items-baseline justify-between gap-3">
                <p className="tabular text-2xl font-bold tracking-tight text-ink">{formatPrice(p.price)}</p>
                <span className="text-xs font-semibold text-brand-700">{priceTerms}</span>
              </div>
              <p className="tabular mt-1 text-sm text-muted">
                {formatArea(p.area, p.areaUnit)}
                {perUnit && ` · ${perUnit}`}
              </p>
              <div className="mt-5 border-t border-line pt-5">
                <SellerCard seller={p.seller} identityVerified={identityVerified} compact />
              </div>
              <div className="mt-5">
                {available ? (
                  <ContactActions variant="panel" source="detail" plot={plotRef} sellerName={p.seller.name} />
                ) : (
                  <ButtonLink href={similarPath} size="lg" className="w-full">
                    See similar land
                  </ButtonLink>
                )}
              </div>
              <p className="mt-4 text-center text-xs text-muted">Free for buyers · No login needed</p>
            </div>
            <ShareButton
              title={p.title}
              label="Share this property"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-line-strong bg-white text-sm font-semibold text-ink-soft hover:bg-mist"
            />
          </div>
        </aside>
      </div>

      {similar.length > 0 && (
        <section className="container-page mt-12 border-t border-line pt-10 lg:border-0 lg:pt-0">
          <h2 className="text-lg font-bold tracking-tight sm:text-xl">Similar land in {p.city.name}</h2>
          <div className="no-scrollbar -mx-4 mt-5 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
            {similar.map((s) => (
              <PropertyCard key={s.id} p={s} className="w-[84%] shrink-0 snap-start sm:w-auto" sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 84vw" />
            ))}
          </div>
        </section>
      )}

      {/* Mobile sticky contact bar — the main action is never hidden */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-4 pt-2.5 backdrop-blur shadow-[0_-8px_24px_-12px_rgb(14_26_20/0.18)] lg:hidden">
        {available ? (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="tabular truncate text-[17px] leading-tight font-bold tracking-tight text-ink">{formatPrice(p.price)}</p>
              <p className="truncate text-xs text-muted">
                {formatArea(p.area, p.areaUnit)} · {priceTerms}
              </p>
            </div>
            <ContactActions variant="dock" source="detail" plot={plotRef} sellerName={p.seller.name} />
          </div>
        ) : (
          <ButtonLink href={similarPath} size="lg" className="w-full">
            See similar land
          </ButtonLink>
        )}
      </div>
    </article>
  );
}

function Section({ title, icon, className, children }: { title: string; icon?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={`border-t border-line py-7 ${className ?? ""}`}>
      <h2 className="mb-4 flex items-center gap-2 text-base font-bold tracking-tight text-ink sm:text-lg">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 px-3 py-3 sm:px-4">
      <dt className="truncate text-[11px] font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd className="tabular mt-1 truncate text-[15px] font-semibold text-ink">{value}</dd>
      {sub && <dd className="tabular mt-0.5 truncate text-[11px] text-muted">{sub}</dd>}
    </div>
  );
}

function SellerCard({
  seller,
  identityVerified,
  compact = false,
}: {
  seller: { name: string; sellerType: "OWNER" | "BROKER"; phoneVerifiedAt: Date | null; createdAt: Date; profileSlug: string | null; isBlocked: boolean; _count: { properties: number } };
  identityVerified: boolean;
  compact?: boolean;
}) {
  const phoneVerified = Boolean(seller.phoneVerifiedAt);
  return (
    <div className={compact ? "" : "rounded-2xl p-4 ring-1 ring-line"}>
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-base font-bold text-white">{seller.name.charAt(0)}</span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-ink">{seller.name}</p>
          <p className="text-[13px] text-muted">
            {sellerLabel(seller.sellerType)} · {seller._count.properties} live listing{seller._count.properties === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
        <VerifiedChip done={phoneVerified} icon={<BadgeCheck className="size-3.5" aria-hidden />} label={phoneVerified ? "Phone verified" : "Phone not verified"} />
        <VerifiedChip done={identityVerified} icon={<Fingerprint className="size-3.5" aria-hidden />} label={identityVerified ? "Aadhaar verified" : "Aadhaar pending"} />
      </ul>
      {!compact && (
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          {identityVerified && phoneVerified
            ? "We've confirmed who this seller is: their phone number and their identity with Aadhaar."
            : identityVerified
              ? "We've confirmed this seller's identity with Aadhaar."
              : phoneVerified
                ? "We've confirmed this seller's phone number. Their Aadhaar check isn't done yet."
                : "This seller hasn't been verified yet."}{" "}
          We don&apos;t check land papers, so always verify ownership before you pay.
        </p>
      )}
      {seller.profileSlug && !seller.isBlocked && seller._count.properties > 1 && (
        <Link href={sellerProfilePath(seller.profileSlug)} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800">
          See all {seller._count.properties} properties by {seller.name.split(" ")[0]} →
        </Link>
      )}
    </div>
  );
}

function VerifiedChip({ done, icon, label }: { done: boolean; icon: React.ReactNode; label: string }) {
  return (
    <li className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${done ? "bg-brand-50 text-brand-800 ring-1 ring-brand-100" : "bg-mist text-muted ring-1 ring-line"}`}>
      {icon} {label}
    </li>
  );
}
