import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PropertyCard } from "@/components/listing/property-card";
import { ButtonA, ButtonLink } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/ui/icons";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { LAND_TYPES, LAND_TYPE_SLUGS, landTypeFromSlug } from "@/lib/land";
import { RESERVED_SLUGS } from "@/lib/site";
import { supportWhatsAppLink } from "@/lib/whatsapp-links";
import { getLatestListings } from "@/server/listings/queries";

export const revalidate = 60;

async function load(params: Promise<{ city: string; type: string }>) {
  const { city: citySlug, type: typeSlug } = await params;
  const type = landTypeFromSlug(typeSlug);
  if (!type || type === "OTHER" || RESERVED_SLUGS.has(citySlug) || !/^[a-z0-9-]+$/.test(citySlug)) return null;
  const city = await db.city.findUnique({ where: { slug: citySlug } });
  if (!city) return null;
  return { city, type };
}

export async function generateStaticParams() {
  const combos = await db.property.groupBy({ by: ["cityId", "landType"], where: { status: "ACTIVE" } });
  const cities = await db.city.findMany({ where: { id: { in: [...new Set(combos.map((c) => c.cityId))] } }, select: { id: true, slug: true } });
  const slugOf = new Map(cities.map((c) => [c.id, c.slug]));
  return combos.flatMap((c) => (slugOf.has(c.cityId) && c.landType !== "OTHER" ? [{ city: slugOf.get(c.cityId)!, type: LAND_TYPE_SLUGS[c.landType] }] : []));
}

export async function generateMetadata(props: PageProps<"/[city]/[type]">): Promise<Metadata> {
  const data = await load(props.params);
  if (!data) return { title: "Not found" };
  const label = LAND_TYPES[data.type].label;
  return {
    title: `${label} for sale in ${data.city.name}`,
    description: `${label} for sale in ${data.city.name}, ${data.city.state}. Real photos and prices — contact sellers directly on WhatsApp.`,
    alternates: { canonical: `/${data.city.slug}/${LAND_TYPE_SLUGS[data.type]}` },
  };
}

/** Crawlable, genuinely useful "type in city" pages — only for live cities and real types. */
export default async function CityTypePage(props: PageProps<"/[city]/[type]">) {
  const data = await load(props.params);
  if (!data) notFound();
  const { city, type } = data;
  const label = LAND_TYPES[type].label;
  const listings = await getLatestListings(24, city.id, type);
  const prices = listings.map((l) => Number(l.price)).sort((a, b) => a - b);

  return (
    <div className="pb-24 md:pb-16">
      <section className="border-b border-line bg-mist">
        <div className="container-page py-8 sm:py-12">
          <nav aria-label="Breadcrumb" className="text-sm text-muted">
            <Link href="/" className="hover:text-ink">Home</Link> / <Link href={`/${city.slug}`} className="hover:text-ink">{city.name}</Link> / {label}
          </nav>
          <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">
            {label} for sale in {city.name}
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] text-muted sm:text-base">
            {listings.length > 0
              ? `${listings.length} ${listings.length === 1 ? "property" : "properties"} available${prices.length > 1 ? `, from ${formatPrice(prices[0])} to ${formatPrice(prices[prices.length - 1])}` : ""}. Contact sellers directly — no login needed.`
              : `No ${label.toLowerCase()} listed in ${city.name} right now.`}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {(Object.keys(LAND_TYPE_SLUGS) as (keyof typeof LAND_TYPE_SLUGS)[])
              .filter((t) => t !== "OTHER")
              .map((t) => (
                <Link
                  key={t}
                  href={`/${city.slug}/${LAND_TYPE_SLUGS[t]}`}
                  aria-current={t === type ? "page" : undefined}
                  className={t === type ? "rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white" : "rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink-soft ring-1 ring-line hover:ring-brand-300"}
                >
                  {LAND_TYPES[t].label}
                </Link>
              ))}
          </div>
        </div>
      </section>

      <div className="container-page mt-8">
        {listings.length > 0 ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
              {listings.map((p, i) => (
                <PropertyCard key={p.id} p={p} priority={i === 0} />
              ))}
            </div>
            <div className="mt-8 flex justify-center">
              <ButtonLink href={`/search?city=${city.slug}&type=${type}`} variant="secondary" size="lg">
                Filter by budget and size <ArrowRight />
              </ButtonLink>
            </div>
          </>
        ) : (
          <div className="rounded-3xl bg-mist p-10 text-center ring-1 ring-line">
            <p className="font-semibold">Tell us what you need</p>
            <p className="mt-1 text-sm text-muted">We&apos;ll message you when {label.toLowerCase()} is listed in {city.name}.</p>
            <ButtonA href={supportWhatsAppLink(`Hi, I'm looking for ${label.toLowerCase()} in ${city.name}.`)} target="_blank" rel="noopener" className="mt-4">
              <WhatsAppIcon /> Tell us on WhatsApp
            </ButtonA>
          </div>
        )}
      </div>
    </div>
  );
}
