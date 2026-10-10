import { ArrowRight, BadgeCheck, ChevronLeft, ChevronRight, Fingerprint, MapPin, ShieldCheck, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactActions } from "@/components/listing/contact-actions";
import { PropertyCard } from "@/components/listing/property-card";
import { ReportSheet } from "@/components/report/report-sheet";
import { ShareProfile } from "@/components/seller/share-profile";
import { ButtonLink } from "@/components/ui/button";
import { IntentLink } from "@/components/ui/intent-link";
import { cn } from "@/lib/cn";
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

export async function generateMetadata(props: PageProps<"/sellers/[slug]">): Promise<Metadata> {
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

export default async function SellerProfilePage(props: PageProps<"/sellers/[slug]">) {
  const { slug } = await props.params;
  const profile = await getPublicSellerProfile(slug, pageOf(await props.searchParams));
  if (!profile) notFound();
  if (profile.slug !== slug) notFound(); // only the canonical lower-case slug

  const url = sellerProfileUrl(profile.slug);
  const pageHref = (n: number) => (n <= 1 ? sellerProfilePath(profile.slug) : `${sellerProfilePath(profile.slug)}?page=${n}`);
  const firstName = profile.name.trim().split(/\s+/)[0] || profile.name;
  const places = profile.cities.map((c) => c.name);
  const since = profile.memberSince.toLocaleDateString("en-IN", { month: "short", year: "numeric" });

  return (
    <div className="pb-24 md:pb-16">
      {/* ── Seller card */}
      <section className="container-page pt-4 sm:pt-8">
        <div className="overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-line">
          <div className="relative isolate h-24 bg-linear-to-br from-brand-800 via-brand-700 to-brand-500 sm:h-32">
            <div className="bg-contours absolute inset-0 -z-10" aria-hidden />
            <div className="absolute top-3 right-3 sm:top-4 sm:right-4">
              <ShareProfile url={url} name={profile.name} variant="icon" total={profile.total} />
            </div>
          </div>
          <div className="px-5 pb-5 sm:px-8 sm:pb-7">
            <span className="relative z-10 -mt-10 flex size-20 items-center justify-center rounded-2xl bg-brand-600 text-3xl font-bold text-white shadow-card ring-4 ring-white sm:-mt-12 sm:size-24">
              {profile.name.trim().charAt(0).toUpperCase() || "S"}
            </span>
            <div className="mt-3">
              <div className="min-w-0">
                <h1 className="text-2xl leading-tight font-bold tracking-tight text-ink sm:text-[1.75rem]">{profile.name}</h1>
                <p className="mt-1 flex items-start gap-1.5 text-[15px] text-muted">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                  <span>
                    {sellerLabel(profile.sellerType)}
                    {places.length > 0 && <> · Land in {places.join(", ")}</>}
                  </span>
                </p>
                {(profile.phoneVerified || profile.identityVerified) && (
                  <ul className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                    {profile.phoneVerified && (
                      <li className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-brand-800 ring-1 ring-brand-100">
                        <BadgeCheck className="size-3.5" aria-hidden /> Phone verified
                      </li>
                    )}
                    {profile.identityVerified && (
                      <li className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-brand-800 ring-1 ring-brand-100">
                        <Fingerprint className="size-3.5" aria-hidden /> Aadhaar verified
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-3 divide-x divide-line rounded-2xl bg-mist ring-1 ring-line">
              <Stat label={profile.total === 1 ? "Property" : "Properties"} value={String(profile.total)} />
              <Stat label={profile.cities.length === 1 ? "City" : "Cities"} value={String(profile.cities.length)} />
              <Stat label="Seller since" value={since} />
            </dl>

            <div className="mt-4">
              <ShareProfile url={url} name={profile.name} variant="button" total={profile.total} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Listings */}
      <section className="container-page mt-8 sm:mt-10">
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
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-ink sm:text-xl">Land for sale by {firstName}</h2>
                <p className="mt-0.5 text-sm text-muted">Tap a property for photos and details, or contact {firstName} directly.</p>
              </div>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
              {profile.listings.map((p, i) => (
                <li key={p.id} className="flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-line transition hover:shadow-card hover:ring-line-strong">
                  <PropertyCard
                    p={p}
                    priority={i === 0 && profile.page === 1}
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="flex-1 rounded-none ring-0 hover:translate-y-0 hover:shadow-none hover:ring-0"
                  />
                  <div className="px-4 pb-4">
                    <ContactActions
                      variant="row"
                      source="card"
                      plot={{ id: p.id, code: p.code, slug: p.slug, title: p.title }}
                     
                      sellerName={p.seller.name}
                    />
                  </div>
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
      </section>

      {/* ── Trust + report */}
      <section className="container-page mt-10">
        <div className="rounded-2xl bg-mist p-5 ring-1 ring-line sm:p-6">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <ShieldCheck className="size-[18px] text-brand-600" aria-hidden /> Buy safely
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {profile.identityVerified && profile.phoneVerified
              ? `We've confirmed who ${firstName} is: their phone number and their identity with Aadhaar.`
              : profile.phoneVerified
                ? `We've confirmed ${firstName}'s phone number.`
                : `${firstName} hasn't been verified yet.`}{" "}
            We don&apos;t check land papers — visit the land and check the ownership documents (khatauni, registry) before paying anything.
          </p>
          <div className="mt-3">
            <ReportSheet target="PROFILE" targetRef={profile.slug} />
          </div>
        </div>

        {/* Every shared profile is also an invitation to sell. */}
        <IntentLink href="/sell" className="group mt-4 flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-line transition hover:ring-brand-300 sm:p-5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <Store className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-ink">Selling land too?</span>
            <span className="block text-sm text-muted">Get your own page like this — list free on WhatsApp or here.</span>
          </span>
          <ArrowRight className="size-5 shrink-0 text-brand-700 transition group-hover:translate-x-0.5" aria-hidden />
        </IntentLink>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-3 py-3 text-center">
      <dd className="tabular truncate text-[17px] font-bold text-ink">{value}</dd>
      <dt className="mt-0.5 truncate text-xs text-muted">{label}</dt>
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
