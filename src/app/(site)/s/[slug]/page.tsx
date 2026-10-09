import { BadgeCheck, CalendarDays, ChevronLeft, ChevronRight, Fingerprint, MapPin, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactActions } from "@/components/listing/contact-actions";
import { PropertyCard } from "@/components/listing/property-card";
import { ReportSheet } from "@/components/report/report-sheet";
import { ShareProfile } from "@/components/seller/share-profile";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { sellerLabel } from "@/lib/seller-label";
import { sellerProfilePath, sellerProfileUrl } from "@/lib/seller-profile";
import { getPublicSellerProfile } from "@/server/seller/profile";

// Always current: a plot that is sold, hidden or newly approved shows up (or disappears) immediately.
export const dynamic = "force-dynamic";

function pageOf(sp: Record<string, string | string[] | undefined>) {
  const raw = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export async function generateMetadata(props: PageProps<"/s/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const profile = await getPublicSellerProfile(slug, 1);
  if (!profile) return { title: "Seller not found", robots: { index: false } };

  const title = `${profile.name} — Available Land Properties`;
  const where = profile.cities.map((c) => c.name).slice(0, 3).join(", ");
  const description =
    profile.total > 0
      ? `${profile.total} ${profile.total === 1 ? "property" : "properties"} for sale by ${profile.name}${where ? ` in ${where}` : ""}. See photos and prices, and contact the seller directly on WhatsApp.`
      : `${profile.name} has no properties available right now.`;
  const cover = profile.listings.find((l) => l.images[0])?.images[0];

  return {
    title,
    description,
    alternates: { canonical: sellerProfilePath(profile.slug) },
    // No live listings → nothing useful for search engines (and nothing to preview).
    robots: { index: profile.total > 0, follow: true },
    openGraph: {
      type: "profile",
      title,
      description,
      url: sellerProfilePath(profile.slug),
      images: cover ? [{ url: cover.url, width: cover.width ?? 1600, height: cover.height ?? 1200, alt: `Land by ${profile.name}` }] : undefined,
    },
    twitter: { card: cover ? "summary_large_image" : "summary", title, description },
  };
}

export default async function SellerProfilePage(props: PageProps<"/s/[slug]">) {
  const { slug } = await props.params;
  const profile = await getPublicSellerProfile(slug, pageOf(await props.searchParams));
  if (!profile) notFound();
  if (profile.slug !== slug) notFound(); // only the canonical lower-case slug

  const prices = profile.listings.map((l) => Number(l.price));
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const url = sellerProfileUrl(profile.slug);
  const pageHref = (n: number) => (n <= 1 ? sellerProfilePath(profile.slug) : `${sellerProfilePath(profile.slug)}?page=${n}`);

  return (
    <div className="pb-24 md:pb-16">
      {/* Seller header */}
      <section className="border-b border-line bg-mist">
        <div className="container-page py-7 sm:py-10">
          <div className="flex items-start gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-bold text-white sm:size-16">
              {profile.name.trim().charAt(0).toUpperCase() || "S"}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-extrabold text-ink sm:text-3xl">{profile.name}</h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
                <span className="inline-flex items-center gap-1">
                  <Store className="size-3.5" aria-hidden /> {sellerLabel(profile.sellerType)}
                </span>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="size-3.5" aria-hidden /> On InstaPlots since{" "}
                  {profile.memberSince.toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                </span>
              </p>
              {(profile.phoneVerified || profile.identityVerified) && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {profile.phoneVerified && (
                    <li className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-brand-800 ring-1 ring-brand-100">
                      <BadgeCheck className="size-3.5" aria-hidden /> Phone verified
                    </li>
                  )}
                  {profile.identityVerified && (
                    <li className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-brand-800 ring-1 ring-brand-100">
                      <Fingerprint className="size-3.5" aria-hidden /> Identity verified
                    </li>
                  )}
                </ul>
              )}
            </div>
            <div className="hidden shrink-0 sm:block">
              <ShareProfile url={url} name={profile.name} variant="button" total={profile.total} />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <p>
              <span className="tabular text-lg font-bold text-ink">{profile.total}</span>{" "}
              <span className="text-muted">available {profile.total === 1 ? "property" : "properties"}</span>
            </p>
            {profile.total > 0 && minPrice > 0 && (
              <p className="text-muted">
                from <span className="font-semibold text-ink">{formatPrice(minPrice)}</span>
              </p>
            )}
            {profile.cities.length > 0 && (
              <p className="flex flex-wrap items-center gap-1.5 text-muted">
                <MapPin className="size-3.5" aria-hidden />
                {profile.cities.map((c, i) => (
                  <span key={c.slug}>
                    <Link href={`/${c.slug}`} className="font-medium text-ink-soft hover:text-brand-700">
                      {c.name}
                    </Link>
                    {i < profile.cities.length - 1 && ","}
                  </span>
                ))}
              </p>
            )}
            <div className="sm:hidden">
              <ShareProfile url={url} name={profile.name} variant="button" total={profile.total} />
            </div>
          </div>
        </div>
      </section>

      {/* Listings */}
      <div className="container-page mt-6 sm:mt-8">
        {profile.total === 0 ? (
          <div className="mx-auto max-w-md rounded-3xl bg-mist px-6 py-12 text-center ring-1 ring-line">
            <p className="text-lg font-bold">No properties available right now</p>
            <p className="mt-1.5 text-sm text-muted">{profile.name}&apos;s properties may have been sold. Explore other land for sale near you.</p>
            <ButtonLink href="/search" className="mt-5">
              Browse all land
            </ButtonLink>
          </div>
        ) : (
          <>
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {profile.listings.map((p, i) => (
                <li key={p.id} className="flex flex-col gap-2.5">
                  <PropertyCard p={p} priority={i === 0 && profile.page === 1} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" />
                  <ContactActions
                    variant="bar"
                    source="card"
                    plot={{ id: p.id, code: p.code, slug: p.slug, title: p.title }}
                    sellerPhone={p.seller.phone}
                    sellerName={p.seller.name}
                  />
                </li>
              ))}
            </ul>

            {profile.pages > 1 && (
              <nav aria-label="Pages" className="mt-10 flex items-center justify-center gap-1.5">
                <PageLink href={pageHref(profile.page - 1)} disabled={profile.page <= 1} label="Previous page">
                  <ChevronLeft className="size-4" aria-hidden />
                </PageLink>
                {Array.from({ length: profile.pages }, (_, i) => i + 1).map((n) => (
                  <Link
                    key={n}
                    href={pageHref(n)}
                    aria-current={n === profile.page ? "page" : undefined}
                    className={cn(
                      "flex size-10 items-center justify-center rounded-full text-sm font-semibold",
                      n === profile.page ? "bg-brand-600 text-white" : "text-ink-soft hover:bg-mist",
                    )}
                  >
                    {n}
                  </Link>
                ))}
                <PageLink href={pageHref(profile.page + 1)} disabled={profile.page >= profile.pages} label="Next page">
                  <ChevronRight className="size-4" aria-hidden />
                </PageLink>
              </nav>
            )}
          </>
        )}

        <p className="mx-auto mt-10 max-w-xl text-center text-xs leading-relaxed text-muted">
          Verification means we checked the seller&apos;s phone{profile.identityVerified ? " and identity" : ""} — not the land&apos;s legal papers. Visit the
          land and verify ownership and documents before paying anything.
        </p>
        <div className="mt-4 flex justify-center">
          <ReportSheet target="PROFILE" targetRef={profile.slug} />
        </div>
      </div>
    </div>
  );
}

function PageLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  if (disabled) {
    return (
      <span aria-hidden className="flex size-10 items-center justify-center rounded-full text-faint">
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className="flex size-10 items-center justify-center rounded-full text-ink-soft hover:bg-mist">
      {children}
    </Link>
  );
}
