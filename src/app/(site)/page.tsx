import { ArrowRight, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { HeroSearch } from "@/components/site/hero-search";
import { IntentLink } from "@/components/ui/intent-link";
import { LaunchSection } from "@/components/site/launch";
import { HowItWorksBoth, LandTypeTiles, ListingRail, SectionHeading, WhyUs } from "@/components/site/sections";
import { ButtonLink } from "@/components/ui/button";
import { defaultShareImage, ogBase, site } from "@/lib/site";
import { getBuyerDemand, getPlaceSuggestions } from "@/server/buyer-requests";
import { getFoundingSpots } from "@/server/founding";
import { getCitiesWithCounts, getLatestListings, getMarketStats } from "@/server/listings/queries";

export const revalidate = 60;

/** The tab says just "InstaPlots"; link previews and search snippets carry the pitch. */
export const metadata: Metadata = {
  title: { absolute: site.name },
  alternates: { canonical: "/" },
  openGraph: {
    ...ogBase,
    type: "website",
    title: `${site.name}: land and plots for sale near you`,
    description: site.description,
    url: "/",
    images: [defaultShareImage],
  },
  twitter: { card: "summary_large_image", title: `${site.name}: land and plots for sale near you`, description: site.description, images: [defaultShareImage] },
};

/** Tells Google the site's name and logo (shown next to results). */
const siteLd = [
  { "@context": "https://schema.org", "@type": "WebSite", name: site.name, alternateName: "instaplots.com", url: site.url },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    url: site.url,
    logo: `${site.url}/brand/icon-512.png`,
    description: site.description,
  },
];

export default async function HomePage() {
  const [cities, latest, stats, spots, demand, places] = await Promise.all([
    getCitiesWithCounts(8),
    getLatestListings(8),
    getMarketStats(),
    getFoundingSpots(),
    getBuyerDemand(),
    getPlaceSuggestions(),
  ]);
  const totalLive = stats.live;
  const launch = <LaunchSection spots={spots} demand={demand} places={places} />;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(siteLd).replace(/</g, "\\u003c") }} />
      {/* ───── Hero: search first ───── */}
      <section className="relative isolate overflow-hidden bg-brand-950">
        {/* The LCP on phones. Dimmed to 60% behind text, so a lighter encode (q50) is visually identical. */}
        <Image src="/demo/land-066.webp" alt="" fill preload fetchPriority="high" quality={50} sizes="100vw" className="-z-10 object-cover object-[50%_60%] opacity-60" />
        <div className="absolute inset-0 -z-10 bg-linear-to-b from-brand-950/70 via-brand-950/40 to-brand-950/80" />
        <div className="container-page pt-12 pb-10 sm:pt-16 sm:pb-14 lg:pt-20 lg:pb-16">
          <h1 className="max-w-2xl text-[2.4rem] leading-[1.05] font-extrabold text-white sm:text-5xl lg:text-[3.25rem]">Your piece of land is waiting.</h1>
          <p className="mt-4 max-w-xl text-base text-white/85 sm:text-lg">
            Farmland, house plots and shop land near you, with real photos and the real price. Like one? Call or WhatsApp the seller. No login, no fee.
          </p>
          <div className="mt-7 max-w-4xl sm:mt-8 lg:max-w-[52rem]">
            <HeroSearch />
          </div>
        </div>
      </section>

      {/* ───── Popular locations ───── */}
      {cities.length > 0 && (
      <section className="container-page pt-12 sm:pt-20">
        <SectionHeading
          title="Popular locations"
          action={
            <Link href="/cities" className="hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-brand-700 sm:inline-flex">
              All cities <ArrowRight className="size-4" aria-hidden />
            </Link>
          }
        />
        {/* Just the place and how much land is there: a photo would only be a stock picture of somewhere else. */}
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
          {cities.map((c) => (
            <li key={c.id}>
              <IntentLink
                href={`/${c.slug}`}
                className="group flex h-full items-center gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-soft hover:ring-brand-300 focus-visible:ring-2 focus-visible:ring-brand-500 sm:gap-3.5 sm:p-4"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100 transition group-hover:bg-brand-600 group-hover:text-white group-hover:ring-brand-600 sm:size-11">
                  <MapPin className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[15px] leading-tight font-bold text-ink sm:text-base">{c.name}</span>
                  {c.state.toLowerCase() !== c.name.toLowerCase() && <span className="mt-0.5 block truncate text-xs text-muted sm:text-[13px]">{c.state}</span>}
                  <span className="tabular mt-2 inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-800">
                    {c.live} {c.live === 1 ? "plot" : "plots"}
                  </span>
                </span>
                <ArrowRight className="hidden size-4 shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-brand-700 sm:block" aria-hidden />
              </IntentLink>
            </li>
          ))}
        </ul>
        <Link href="/cities" className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-700 sm:hidden">
          All cities <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>
      )}

      {/* ───── Latest land, then the launch invitations (before the first listing: invitations only) ───── */}
      {latest.length > 0 ? (
        <>
          <section className="container-page py-12 sm:py-20">
            <SectionHeading
              title="Latest land"
              action={
                <Link href="/search" className="hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-brand-700 sm:inline-flex">
                  View all {totalLive} <ArrowRight className="size-4" aria-hidden />
                </Link>
              }
            />
            <ListingRail items={latest} />
            <ButtonLink href="/search" variant="secondary" size="lg" className="mt-6 w-full sm:hidden">
              View all {totalLive} plots <ArrowRight />
            </ButtonLink>
          </section>
          <div className="pb-12 sm:pb-20">{launch}</div>
        </>
      ) : (
        <div className="py-12 sm:py-20">{launch}</div>
      )}

      {/* ───── Browse by type ───── */}
      <section className="bg-mist py-12 sm:py-20">
        <div className="container-page">
          <SectionHeading title="What are you looking for?" />
          <LandTypeTiles counts={stats.typeCounts} citySlug={undefined} />
        </div>
      </section>

      {/* ───── Why ───── */}
      <section className="container-page py-12 sm:py-20">
        <SectionHeading title="Why buyers and sellers trust InstaPlots" description="Buying or selling land is a big decision. We keep it simple, honest and in your hands." />
        <WhyUs />
      </section>

      {/* ───── How it works ───── */}
      <section className="bg-mist py-12 sm:py-20">
        <div className="container-page">
          <SectionHeading title="How it works" description="One place where people looking for land meet the sellers who have it." />
          <HowItWorksBoth />
        </div>
      </section>

      {/* ───── CTA ───── */}
      <section className="container-page py-12 sm:py-20">
        <div className="flex flex-col items-start justify-between gap-6 rounded-[2rem] bg-brand-700 p-7 text-white sm:flex-row sm:items-center sm:p-12">
          <div>
            <h2 className="text-2xl font-extrabold sm:text-3xl">Buying or selling land? Start here.</h2>
            <p className="mt-1.5 flex items-center gap-1.5 text-white/80">
              <MapPin className="size-4" aria-hidden />{" "}
              {totalLive > 0 ? `${totalLive} ${totalLive === 1 ? "plot" : "plots"} waiting for the right buyer right now.` : "New land is being added. List yours free."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <ButtonLink href="/search" variant="white" size="sm" className="h-10 px-4">
              Start searching <ArrowRight />
            </ButtonLink>
            <ButtonLink href="/sell" size="sm" className="h-10 bg-white/10 px-4 shadow-none ring-1 ring-white/25 hover:bg-white/15">
              Sell your land
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
