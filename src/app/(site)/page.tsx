import { ArrowRight, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { HeroSearch } from "@/components/site/hero-search";
import { IntentLink } from "@/components/ui/intent-link";
import { HowItWorksBoth, LandTypeTiles, ListingRail, SectionHeading, WhyUs } from "@/components/site/sections";
import { ButtonLink } from "@/components/ui/button";
import { defaultShareImage, ogBase, site } from "@/lib/site";
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

/** Cover photos for city cards: a stable pick per city until cities get their own images. */
const CITY_COVERS = ["/demo/land-090.webp", "/demo/land-097.webp", "/demo/land-118.webp", "/demo/land-174.webp", "/demo/land-045.webp", "/demo/land-182.webp", "/demo/land-057.webp", "/demo/land-096.webp"];
function cityCover(slug: string) {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CITY_COVERS[h % CITY_COVERS.length];
}

export default async function HomePage() {
  const [cities, latest, stats] = await Promise.all([getCitiesWithCounts(8), getLatestListings(8), getMarketStats()]);
  const totalLive = stats.live;

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
        <ul className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 lg:grid-cols-5 sm:overflow-visible sm:px-0">
          {cities.map((c) => (
            <li key={c.id} className="w-[44%] shrink-0 snap-start sm:w-auto">
              <IntentLink href={`/${c.slug}`} className="group relative block aspect-[4/5] overflow-hidden rounded-3xl bg-mist sm:aspect-[4/3]">
                <Image src={cityCover(c.slug)} alt="" fill sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 44vw" className="object-cover transition duration-500 group-hover:scale-[1.04]" />
                <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                  <p className="text-lg font-bold">{c.name}</p>
                  <p className="text-sm text-white/80">{c.live} {c.live === 1 ? "plot" : "plots"} available</p>
                </div>
              </IntentLink>
            </li>
          ))}
        </ul>
      </section>
      )}

      {/* ───── Latest land ───── */}
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
              <MapPin className="size-4" aria-hidden /> {totalLive} plots waiting for the right buyer right now.
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
