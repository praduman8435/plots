import { BadgeCheck, CalendarCheck, Check, Fingerprint, Hash, Info, IndianRupee, LandPlot, MapPin, Maximize2, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApproxMap } from "@/components/listing/approx-map";
import { ContactActions } from "@/components/listing/contact-actions";
import { BackButton, ShareButton, ViewBeacon } from "@/components/listing/detail-client";
import { Gallery } from "@/components/listing/gallery";
import { PropertyCard } from "@/components/listing/property-card";
import { ButtonLink } from "@/components/ui/button";
import { formatPrice, formatRelativeDate } from "@/lib/format";
import { freshnessLabel } from "@/lib/freshness";
import { LAND_TYPES, LAND_TYPE_SLUGS, formatPricePerUnit, placeName } from "@/lib/land";
import { sellerLabel } from "@/lib/seller-label";
import { sellerProfilePath } from "@/lib/seller-profile";
import { site } from "@/lib/site";
import { formatArea, formatSqftHint } from "@/lib/units";
import { getListingBySlug, getSimilarListings } from "@/server/listings/queries";

export const revalidate = 60;

const PUBLIC_STATUSES = new Set(["ACTIVE", "SOLD", "HIDDEN"]);

export async function generateMetadata(props: PageProps<"/property/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const p = await getListingBySlug(slug);
  if (!p || !PUBLIC_STATUSES.has(p.status)) return { title: "Property not found" };
  const where = `${placeName(p)}, ${p.city.name}`;
  const description = `${formatArea(p.area, p.areaUnit)} ${LAND_TYPES[p.landType].label.toLowerCase()} for sale near ${where} — ${formatPrice(p.price)}. ${p.description.slice(0, 110)}`;
  return {
    title: `${formatArea(p.area, p.areaUnit)} ${LAND_TYPES[p.landType].label} for sale in ${where} — ${formatPrice(p.price)}`,
    description,
    alternates: { canonical: `/property/${p.slug}` },
    robots: { index: p.status === "ACTIVE" },
    openGraph: {
      title: `${formatPrice(p.price)} · ${formatArea(p.area, p.areaUnit)} ${LAND_TYPES[p.landType].label} · ${where}`,
      description,
      images: p.images[0] ? [{ url: p.images[0].url, width: p.images[0].width ?? 1600, height: p.images[0].height ?? 1200 }] : undefined,
    },
  };
}

export default async function PropertyPage(props: PageProps<"/property/[slug]">) {
  const { slug } = await props.params;
  const p = await getListingBySlug(slug);
  if (!p || !PUBLIC_STATUSES.has(p.status)) notFound();

  const available = p.status === "ACTIVE";
  const similar = await getSimilarListings(p);
  const perUnit = formatPricePerUnit(p.price, p.area, p.areaUnit);
  const listed = p.publishedAt ?? p.createdAt;
  const fresh = freshnessLabel(p);
  const plotRef = { id: p.id, code: p.code, slug: p.slug, title: p.title };
  const where = `${placeName(p)}, ${p.city.name}`;
  const sqftHint = formatSqftHint(p.areaSqft, p.areaUnit);
  const identityVerified = p.seller.identityStatus === "VERIFIED";

  const details = [
    { icon: Maximize2, label: "Land size", value: formatArea(p.area, p.areaUnit), sub: sqftHint ?? undefined },
    { icon: LandPlot, label: "Land type", value: LAND_TYPES[p.landType].label },
    { icon: IndianRupee, label: "Price per unit", value: perUnit ?? "—", sub: p.priceNegotiable ? "Negotiable" : "Fixed price" },
    {
      icon: CalendarCheck,
      label: "Availability",
      value: p.lastConfirmedAt ? `Confirmed ${formatRelativeDate(p.lastConfirmedAt).toLowerCase()}` : `Listed ${formatRelativeDate(listed).toLowerCase()}`,
      sub: listed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
    },
    { icon: Hash, label: "Property ID", value: p.code, sub: "Mention it when you call" },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: p.title,
    description: p.description,
    url: `${site.url}/property/${p.slug}`,
    datePosted: listed.toISOString(),
    image: p.images.map((i) => `${site.url}${i.url}`),
    offers: { "@type": "Offer", price: Number(p.price), priceCurrency: "INR", availability: available ? "https://schema.org/InStock" : "https://schema.org/SoldOut" },
    contentLocation: { "@type": "Place", name: where, address: { "@type": "PostalAddress", addressLocality: placeName(p), addressRegion: p.city.state, addressCountry: "IN" } },
  };

  return (
    <article className="pb-32 md:pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <ViewBeacon id={p.id} />

      <nav aria-label="Breadcrumb" className="container-page hidden pt-6 text-sm text-muted md:block">
        <ol className="flex items-center gap-2">
          <li><Link href="/" className="hover:text-ink">Home</Link></li>
          <li aria-hidden>/</li>
          <li><Link href={`/${p.city.slug}`} className="hover:text-ink">{p.city.name}</Link></li>
          <li aria-hidden>/</li>
          <li><Link href={`/${p.city.slug}/${LAND_TYPE_SLUGS[p.landType]}`} className="hover:text-ink">{LAND_TYPES[p.landType].label}</Link></li>
        </ol>
      </nav>

      {/* Photos */}
      <div className="md:container-page md:pt-4">
        <Gallery
          images={p.images}
          title={p.title}
          overlay={
            <div className="absolute inset-x-0 top-0 flex justify-between p-4">
              <BackButton className="flex size-10 items-center justify-center rounded-full bg-white/90 text-ink shadow-card" />
              <ShareButton title={p.title} className="flex size-10 items-center justify-center rounded-full bg-white/90 text-ink shadow-card" />
            </div>
          }
        />
      </div>

      <div className="container-page relative -mt-6 grid gap-8 md:mt-8 lg:grid-cols-[1fr_22rem] lg:gap-12">
        <div className="-mx-4 min-w-0 rounded-t-[1.75rem] bg-white px-4 pt-6 sm:-mx-6 sm:px-6 md:mx-0 md:rounded-none md:px-0 md:pt-0">
          {!available && (
            <div className="mb-5 flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-100">
              <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">{p.status === "SOLD" ? "This property has been sold" : "This property is not available right now"}</p>
                <p className="mt-0.5 text-sm text-amber-800">See similar land below.</p>
              </div>
            </div>
          )}

          {/* Price · size · type · place */}
          <p className="tabular text-[2.2rem] leading-none font-extrabold tracking-tight text-ink sm:text-[2.6rem]">{formatPrice(p.price)}</p>
          <h1 className="mt-3 text-xl leading-snug font-bold text-ink sm:text-2xl">
            {formatArea(p.area, p.areaUnit)} · {LAND_TYPES[p.landType].label}
          </h1>
          <p className="mt-1.5 flex items-start gap-1.5 text-[15px] text-ink-soft">
            <MapPin className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
            <span>
              Near {p.village || p.locality}, {p.city.name}
              {p.city.state !== p.city.name && `, ${p.city.state}`}
            </span>
          </p>
          {available && (
            <p className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${fresh.fresh ? "bg-brand-50 text-brand-800 ring-1 ring-brand-100" : "bg-mist text-ink-soft ring-1 ring-line"}`}>
              {fresh.fresh && <span className="size-2 rounded-full bg-brand-500" aria-hidden />}
              {fresh.text}
            </p>
          )}

          {/* About */}
          <section className="mt-8">
            <h2 className="text-lg font-bold">About this land</h2>
            <p className="mt-3 text-[15px] leading-7 whitespace-pre-line text-ink-soft">{p.description}</p>
            {p.features.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {p.features.map((f) => (
                  <li key={f} className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-800 ring-1 ring-brand-100">
                    <Check className="size-4" aria-hidden /> {f}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Location */}
          <section className="mt-8">
            <h2 className="text-lg font-bold">Location</h2>
            <p className="mt-1 text-sm text-muted">Near {p.village || p.locality}, {p.city.name}</p>
            <div className="mt-3 overflow-hidden rounded-3xl ring-1 ring-line">
              {p.latitude != null && p.longitude != null ? (
                <div className="relative z-0 h-64 sm:h-80">
                  <ApproxMap lat={p.latitude} lng={p.longitude} seed={p.id} label={where} />
                </div>
              ) : (
                <div className="flex h-36 flex-col items-center justify-center gap-2 bg-mist text-center">
                  <MapPin className="size-6 text-brand-600" aria-hidden />
                  <p className="text-sm font-semibold">{where}</p>
                </div>
              )}
              <p className="flex items-start gap-2 bg-white px-4 py-3 text-sm text-muted">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                Approximate location. The seller shares the exact spot when you contact them.
              </p>
            </div>
          </section>

          {/* Key details */}
          <section className="mt-8">
            <h2 className="text-lg font-bold">Key details</h2>
            <dl className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {details.map((d) => (
                <div key={d.label} className="rounded-2xl bg-mist p-3.5 ring-1 ring-line">
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-muted">
                    <d.icon className="size-3.5" aria-hidden /> {d.label}
                  </dt>
                  <dd className="mt-1.5 truncate text-[15px] font-bold text-ink">{d.value}</dd>
                  {d.sub && <dd className="tabular mt-0.5 truncate text-xs text-muted">{d.sub}</dd>}
                </div>
              ))}
            </dl>
          </section>

          {/* Seller */}
          <section className="mt-8">
            <h2 className="text-lg font-bold">Seller</h2>
            <SellerCard seller={p.seller} identityVerified={identityVerified} className="mt-3" />
          </section>

          {/* Safety */}
          <section className="mt-8 rounded-3xl bg-mist p-5 ring-1 ring-line">
            <h2 className="flex items-center gap-2 font-bold text-ink">
              <ShieldAlert className="size-5 text-brand-600" aria-hidden /> Buy safely
            </h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-soft">
              <li>• Before paying or signing, visit the property and verify ownership and documents.</li>
              <li>• Never send money only because you saw a listing online.</li>
              <li>• Confirm property details independently before making a transaction.</li>
            </ul>
          </section>
        </div>

        {/* Desktop contact panel */}
        <aside className="hidden lg:block">
          <div className="sticky top-28 space-y-4">
            <div className="rounded-3xl border border-line bg-white p-6 shadow-card">
              <p className="tabular text-3xl font-extrabold tracking-tight">{formatPrice(p.price)}</p>
              <p className="mt-1 text-sm text-muted">
                {formatArea(p.area, p.areaUnit)} · {perUnit}
              </p>
              <SellerCard seller={p.seller} identityVerified={identityVerified} className="mt-5" compact />
              <div className="mt-5">
                {available ? (
                  <ContactActions variant="panel" source="detail" plot={plotRef} sellerPhone={p.seller.phone} sellerName={p.seller.name} />
                ) : (
                  <ButtonLink href={`/${p.city.slug}/${LAND_TYPE_SLUGS[p.landType]}`} size="lg" className="w-full">
                    See similar land
                  </ButtonLink>
                )}
              </div>
              <p className="mt-4 text-center text-xs text-muted">Free for buyers · No login needed</p>
            </div>
            <ShareButton
              title={p.title}
              label="Share this property"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-line-strong bg-white text-sm font-semibold text-ink-soft hover:bg-mist"
            />
          </div>
        </aside>
      </div>

      {similar.length > 0 && (
        <section className="container-page mt-14">
          <h2 className="text-xl font-extrabold sm:text-2xl">Similar land in {p.city.name}</h2>
          <div className="no-scrollbar -mx-4 mt-5 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
            {similar.map((s) => (
              <PropertyCard key={s.id} p={s} className="w-[84%] shrink-0 snap-start sm:w-auto" sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 84vw" />
            ))}
          </div>
        </section>
      )}

      {/* Mobile sticky contact bar — the main action is never hidden */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-4 pt-3 shadow-[0_-8px_24px_-12px_rgb(14_26_20/0.18)] backdrop-blur-xl lg:hidden">
        {available ? (
          <ContactActions variant="bar" source="detail" plot={plotRef} sellerPhone={p.seller.phone} sellerName={p.seller.name} />
        ) : (
          <ButtonLink href={`/${p.city.slug}/${LAND_TYPE_SLUGS[p.landType]}`} size="lg" className="w-full">
            See similar land
          </ButtonLink>
        )}
      </div>
    </article>
  );
}

function SellerCard({
  seller,
  identityVerified,
  className,
  compact = false,
}: {
  seller: { name: string; sellerType: "OWNER" | "BROKER"; phoneVerifiedAt: Date | null; createdAt: Date; profileSlug: string | null; isBlocked: boolean; _count: { properties: number } };
  identityVerified: boolean;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={`${compact ? "" : "rounded-3xl border border-line bg-white p-4 shadow-soft"} ${className ?? ""}`}>
      <div className="flex items-center gap-3.5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-lg font-bold text-white">{seller.name.charAt(0)}</span>
        <div className="min-w-0">
          <p className="truncate font-bold text-ink">{seller.name}</p>
          <p className="text-sm text-muted">
            {sellerLabel(seller.sellerType)} · {seller._count.properties} live listing{seller._count.properties === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      {seller.profileSlug && !seller.isBlocked && seller._count.properties > 1 && (
        <Link href={sellerProfilePath(seller.profileSlug)} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800">
          See all {seller._count.properties} properties by {seller.name.split(" ")[0]} →
        </Link>
      )}
      {(seller.phoneVerifiedAt || identityVerified) && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {seller.phoneVerifiedAt && (
            <li className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800 ring-1 ring-brand-100">
              <BadgeCheck className="size-3.5" aria-hidden /> Phone verified
            </li>
          )}
          {identityVerified && (
            <li className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800 ring-1 ring-brand-100">
              <Fingerprint className="size-3.5" aria-hidden /> Identity verified
            </li>
          )}
        </ul>
      )}
      {!compact && (
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Verification means we checked the seller&apos;s phone{identityVerified ? " and identity" : ""} — not the land&apos;s legal papers.
        </p>
      )}
    </div>
  );
}
