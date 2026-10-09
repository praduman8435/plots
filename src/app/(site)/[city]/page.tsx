import { ArrowRight, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PropertyCard } from "@/components/listing/property-card";
import { HeroSearch } from "@/components/site/hero-search";
import { LandTypeTiles, SectionHeading, SellOnWhatsAppBand } from "@/components/site/sections";
import { ButtonLink } from "@/components/ui/button";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { RESERVED_SLUGS, site } from "@/lib/site";
import { getCitiesWithCounts, getLatestListings, getMarketStats } from "@/server/listings/queries";

export const revalidate = 60;

export async function generateStaticParams() {
  const cities = await getCitiesWithCounts(200);
  return cities.map((c) => ({ city: c.slug }));
}

async function getCity(slug: string) {
  if (RESERVED_SLUGS.has(slug) || !/^[a-z0-9-]+$/.test(slug)) return null;
  return db.city.findUnique({ where: { slug } });
}

export async function generateMetadata(props: PageProps<"/[city]">): Promise<Metadata> {
  const city = await getCity((await props.params).city);
  if (!city) return { title: "Not found" };
  const title = city.headline ?? `Land & plots for sale in ${city.name}`;
  return {
    title,
    description:
      city.intro ??
      `Agricultural land, residential plots and commercial land for sale in ${city.name}, ${city.state}. Contact sellers directly on WhatsApp.`,
    alternates: { canonical: `/${city.slug}` },
    // Pages for cities with no live land yet stay out of Google until they have something to show.
    robots: { index: (await db.property.count({ where: { cityId: city.id, status: "ACTIVE" } })) > 0 },
  };
}

/** Median farmland price per acre — a genuinely useful number for buyers (and for SEO). */
async function agriPricePerAcre(cityId: string) {
  const rows = await db.property.findMany({
    where: { cityId, status: "ACTIVE", landType: "AGRICULTURAL" },
    select: { price: true, areaSqft: true },
  });
  if (rows.length < 3) return null;
  const per = rows.map((r) => Number(r.price) / (r.areaSqft / 43_560)).sort((a, b) => a - b);
  return { median: per[Math.floor(per.length / 2)], min: per[0], max: per[per.length - 1], count: rows.length };
}

export default async function CityPage(props: PageProps<"/[city]">) {
  const city = await getCity((await props.params).city);
  if (!city) notFound();

  const [stats, latest, pricing] = await Promise.all([
    getMarketStats(city.id),
    getLatestListings(12, city.id),
    agriPricePerAcre(city.id),
  ]);

  const faqs = [
    pricing && {
      q: `What is the price of agricultural land in ${city.name}?`,
      a: `Based on ${pricing.count} live listings on ${site.name}, agricultural land in ${city.name} is asking around ${formatPrice(pricing.median)} per acre (range ${formatPrice(pricing.min)}–${formatPrice(pricing.max)}). Prices depend on road access, irrigation and distance from town.`,
    },
    {
      q: `How are land sizes measured in ${city.name}?`,
      a: `Sellers list land in the unit they use locally, and we show it exactly that way. For comparison, ${site.name} uses 1 marla ≈ ${city.marlaInSqft.toLocaleString("en-IN")} sq ft (1 kanal = 20 marla) and 1 bigha ≈ ${city.bighaInSqft.toLocaleString("en-IN")} sq ft in ${city.name}; 1 acre = 43,560 sq ft. Local measures vary — always confirm with the seller and the land records.`,
    },
    {
      q: "Do I need to sign up to contact a seller?",
      a: "No. Browse freely and tap “Contact Seller on WhatsApp” on any plot. You'll talk to the seller directly.",
    },
    {
      q: "Is the land verified?",
      a: "We verify the seller's phone number, and identity where you see “Aadhaar verified”. We don't check the land's legal papers — visit the land and verify ownership and documents before paying.",
    },
  ].filter(Boolean) as { q: string; a: string }[];

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, "\\u003c") }} />
      <section className="relative isolate overflow-hidden bg-brand-950">
        <Image src="/demo/land-090.webp" alt="" fill priority sizes="100vw" className="-z-10 object-cover opacity-60" />
        <div className="absolute inset-0 -z-10 bg-linear-to-b from-brand-950/70 via-brand-950/50 to-brand-950/90" />
        <div className="container-page py-12 sm:py-16 lg:py-20">
          <nav aria-label="Breadcrumb" className="text-sm text-white/70">
            <Link href="/" className="hover:text-white">Home</Link> <span aria-hidden>/</span> {city.state}
          </nav>
          <h1 className="mt-4 max-w-3xl text-[2.2rem] leading-[1.05] font-extrabold text-white sm:text-5xl lg:text-[3.25rem]">
            Land for sale in <span className="text-brand-300">{city.name}</span>
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/80 sm:text-lg">{city.intro ?? `Residential plots, farmland and commercial land for sale in ${city.name}, ${city.state}. See real photos and prices, and talk to sellers directly on WhatsApp.`}</p>
          <dl className="mt-7 flex flex-wrap gap-x-8 gap-y-3 text-white">
            <div>
              <dt className="text-xs text-white/60">Plots available</dt>
              <dd className="text-2xl font-extrabold">{stats.live}</dd>
            </div>
            <div>
              <dt className="text-xs text-white/60">Verified sellers</dt>
              <dd className="text-2xl font-extrabold">{stats.sellers}</dd>
            </div>
            {pricing && (
              <div>
                <dt className="text-xs text-white/60">Farmland, median / acre</dt>
                <dd className="text-2xl font-extrabold">{formatPrice(pricing.median)}</dd>
              </div>
            )}
          </dl>
          <div className="mt-8 max-w-3xl">
            <HeroSearch citySlug={city.slug} />
          </div>
        </div>
      </section>

      <section className="container-page py-12 sm:py-16">
        <SectionHeading title={`Browse ${city.name} by land type`} />
        <LandTypeTiles counts={stats.typeCounts} citySlug={city.slug} />
      </section>

      <section className="bg-mist py-12 sm:py-16">
        <div className="container-page">
          <SectionHeading
            title={`Latest plots in ${city.name}`}
            action={
              <Link href={`/search?city=${city.slug}`} className="hidden items-center gap-1.5 text-sm font-semibold text-brand-700 sm:inline-flex">
                View all {stats.live} <ArrowRight className="size-4" aria-hidden />
              </Link>
            }
          />
          {latest.length === 0 ? (
            <div className="rounded-3xl bg-white p-8 text-center ring-1 ring-line">
              <p className="font-semibold">No land listed in {city.name} yet</p>
              <p className="mt-1 text-sm text-muted">Own or sell land here? Be the first to list it.</p>
              <ButtonLink href="/sell" className="mt-4">
                Sell your land
              </ButtonLink>
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
                {latest.map((p, i) => (
                  <PropertyCard key={p.id} p={p} priority={i === 0} />
                ))}
              </div>
              <div className="mt-8 flex justify-center">
                <ButtonLink href={`/search?city=${city.slug}`} variant="secondary" size="lg">
                  See all {stats.live} plots in {city.name} <ArrowRight />
                </ButtonLink>
              </div>
            </>
          )}
        </div>
      </section>

      {stats.areaNames.length > 0 && (
        <section className="container-page py-12 sm:py-16">
          <SectionHeading title={`Popular areas in ${city.name}`} />
          <ul className="flex flex-wrap gap-2.5">
            {stats.areaNames.map((name) => (
              <li key={name}>
                <Link
                  href={`/search?${new URLSearchParams({ city: city.slug, q: name })}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink-soft shadow-soft transition hover:border-brand-300 hover:text-brand-800"
                >
                  <MapPin className="size-4 text-brand-600" aria-hidden /> Land in {name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="container-page pb-12 sm:pb-16">
        <SellOnWhatsAppBand />
      </section>

      <section className="bg-mist py-12 sm:py-16">
        <div className="container-page max-w-3xl">
          <SectionHeading title={`Buying land in ${city.name}: common questions`} />
          <div className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-white">
            {faqs.map((f) => (
              <details key={f.q} className="group p-5 open:bg-white sm:p-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink">
                  {f.q}
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-mist text-brand-700 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-[15px] leading-relaxed text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
