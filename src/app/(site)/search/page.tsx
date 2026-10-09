import { MapPin, Search, SearchX, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PropertyCard } from "@/components/listing/property-card";
import { FilterFields } from "@/components/search/filter-fields";
import { FilterSheet } from "@/components/search/filter-sheet";
import { SearchTracker } from "@/components/search/search-tracker";
import { SortSelect } from "@/components/search/sort-select";
import { Button, ButtonA } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/ui/icons";
import { formatPrice } from "@/lib/format";
import { LAND_TYPES } from "@/lib/land";
import { AREA_UNITS } from "@/lib/units";
import { supportWhatsAppLink } from "@/lib/whatsapp-links";
import { getLiveCities, parseSearchParams, searchListings, type SearchFilters } from "@/server/listings/queries";

export async function generateMetadata(props: PageProps<"/search">): Promise<Metadata> {
  const f = parseSearchParams(await props.searchParams);
  const type = f.type ? LAND_TYPES[f.type].label : "Land & plots";
  return {
    title: `${type} for sale${f.q ? ` near ${f.q}` : ""}`,
    description: `Browse ${type.toLowerCase()} for sale${f.q ? ` near ${f.q}` : ""}. Real photos, honest prices, contact sellers directly on WhatsApp.`,
    robots: { index: !f.minPrice && !f.maxPrice && !f.minArea && !f.maxArea && f.page === 1, follow: true },
  };
}

function hrefWith(f: SearchFilters, patch: Partial<Record<keyof SearchFilters | "unit", string | number | undefined>>) {
  const merged: Record<string, string | number | undefined> = {
    city: f.city,
    q: f.q,
    type: f.type,
    minPrice: f.minPrice,
    maxPrice: f.maxPrice,
    minArea: f.minArea,
    maxArea: f.maxArea,
    unit: f.minArea || f.maxArea ? f.areaUnit : undefined,
    sort: f.sort === "recommended" ? undefined : f.sort,
    page: f.page > 1 ? f.page : undefined,
    ...patch,
  };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "") sp.set(k, String(v));
  const qs = sp.toString();
  return qs ? `/search?${qs}` : "/search";
}

export default async function SearchPage(props: PageProps<"/search">) {
  const f = parseSearchParams(await props.searchParams);
  const [{ total, items, city, pages }, cities] = await Promise.all([searchListings(f), getLiveCities()]);

  const unit = AREA_UNITS[f.areaUnit].short;
  const pills: { label: string; href: string }[] = [];
  if (f.q) pills.push({ label: `“${f.q}”`, href: hrefWith(f, { q: undefined, page: undefined }) });
  if (f.type) pills.push({ label: LAND_TYPES[f.type].label, href: hrefWith(f, { type: undefined, page: undefined }) });
  if (f.minPrice || f.maxPrice)
    pills.push({
      label: f.minPrice && f.maxPrice ? `${formatPrice(f.minPrice)} – ${formatPrice(f.maxPrice)}` : f.minPrice ? `From ${formatPrice(f.minPrice)}` : `Up to ${formatPrice(f.maxPrice!)}`,
      href: hrefWith(f, { minPrice: undefined, maxPrice: undefined, page: undefined }),
    });
  if (f.minArea || f.maxArea)
    pills.push({
      label: f.minArea && f.maxArea ? `${f.minArea}–${f.maxArea} ${unit}` : f.minArea ? `${f.minArea}+ ${unit}` : `Up to ${f.maxArea} ${unit}`,
      href: hrefWith(f, { minArea: undefined, maxArea: undefined, unit: undefined, page: undefined }),
    });
  const activeCount = pills.length - (f.q ? 1 : 0);
  const resetHref = f.city ? `/search?city=${f.city}` : "/search";
  const place = city?.name ?? "all cities";

  const typeTabs: { label: string; type?: string }[] = [{ label: "All" }, ...Object.entries(LAND_TYPES).map(([type, t]) => ({ label: t.short, type }))];

  const queryKey = hrefWith(f, { page: undefined });
  const filtered = Boolean(f.type || f.minPrice || f.maxPrice || f.minArea || f.maxArea);

  return (
    <div className="pb-24 md:pb-16">
      <SearchTracker query={queryKey} filtered={filtered} results={total} />
      {/* Search bar */}
      <div className="sticky top-16 z-30 border-b border-line bg-white/95">
        <div className="container-page flex items-center gap-2.5 py-3">
          <form action="/search" method="get" role="search" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full bg-mist px-4 ring-1 ring-line lg:max-w-xl focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-400">
            {f.city && <input type="hidden" name="city" value={f.city} />}
            {f.type && <input type="hidden" name="type" value={f.type} />}
            <Search className="size-[18px] shrink-0 text-muted" aria-hidden />
            <input
              name="q"
              defaultValue={f.q}
              placeholder="Search village or area"
              aria-label="Search by village, area or plot ID"
              enterKeyHint="search"
              className="h-11 w-full min-w-0 bg-transparent text-[16px] placeholder:text-muted focus:outline-none md:h-10 md:text-[15px]"
            />
          </form>
          <div className="lg:hidden">
            <FilterSheet activeCount={activeCount} resetHref={resetHref}>
              <FilterFields f={f} cities={cities} idPrefix="m" />
            </FilterSheet>
          </div>
        </div>
        <nav aria-label="Land type" className="container-page no-scrollbar flex gap-1.5 overflow-x-auto pb-3 lg:hidden">
          {typeTabs.map((t) => {
            const active = (f.type ?? undefined) === t.type;
            return (
              <Link
                key={t.label}
                href={hrefWith(f, { type: t.type, page: undefined })}
                className={
                  active
                    ? "shrink-0 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
                    : "shrink-0 rounded-full bg-mist px-4 py-2 text-sm font-semibold text-ink-soft ring-1 ring-line"
                }
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="container-page mt-6 grid gap-8 lg:mt-8 lg:grid-cols-[16.5rem_1fr]">
        {/* Desktop filters */}
        <aside className="hidden lg:block">
          <form action="/search" method="get" className="sticky top-36 rounded-2xl border border-line bg-white p-5 shadow-soft">
            <h2 className="mb-5 text-base font-bold">Filters</h2>
            <FilterFields f={f} cities={cities} idPrefix="d" />
            <div className="mt-8 flex gap-2">
              <Link href={resetHref} className="flex h-11 flex-1 items-center justify-center rounded-full text-sm font-semibold text-ink-soft hover:bg-mist md:h-10">
                Reset
              </Link>
              <Button type="submit" className="flex-[2]">
                Apply
              </Button>
            </div>
          </form>
        </aside>

        <section aria-labelledby="results-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 id="results-title" className="text-xl font-extrabold text-ink sm:text-2xl">
                {f.type ? LAND_TYPES[f.type].label : "Land for sale"} in {place}
              </h1>
              <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
                <MapPin className="size-3.5" aria-hidden />
                {total} {total === 1 ? "plot" : "plots"} available
              </p>
            </div>
            <SortSelect value={f.sort} />
          </div>

          {pills.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {pills.map((p) => (
                <Link
                  key={p.label}
                  href={p.href}
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 py-1.5 pr-2.5 pl-3.5 text-sm font-semibold text-brand-800 ring-1 ring-brand-100 hover:bg-brand-100"
                >
                  {p.label} <X className="size-3.5" aria-label="Remove filter" />
                </Link>
              ))}
              <Link href={resetHref} className="px-2 py-1.5 text-sm font-semibold text-muted hover:text-ink">
                Clear all
              </Link>
            </div>
          )}

          {items.length > 0 ? (
            <>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
                {items.map((p, i) => (
                  <PropertyCard key={p.id} p={p} priority={i === 0} sizes="(min-width: 1280px) 28vw, (min-width: 1024px) 36vw, (min-width: 640px) 50vw, 100vw" />
                ))}
              </div>
              {pages > 1 && (
                <nav aria-label="Pages" className="mt-10 flex items-center justify-center gap-1.5">
                  {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                    <Link
                      key={n}
                      href={hrefWith(f, { page: n === 1 ? undefined : n })}
                      aria-current={n === f.page ? "page" : undefined}
                      className={
                        n === f.page
                          ? "flex size-11 items-center justify-center rounded-full bg-brand-600 font-semibold text-white"
                          : "flex size-11 items-center justify-center rounded-full font-semibold text-ink-soft hover:bg-mist"
                      }
                    >
                      {n}
                    </Link>
                  ))}
                </nav>
              )}
            </>
          ) : (
            <div className="mt-8 rounded-3xl bg-mist px-6 py-12 text-center ring-1 ring-line">
              <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-soft ring-1 ring-line">
                <SearchX className="size-6" aria-hidden />
              </span>
              <h2 className="mt-5 text-xl font-bold">No land found in this area yet</h2>
              <ul className="mx-auto mt-4 max-w-xs space-y-2 text-left text-[15px] text-ink-soft">
                {(f.maxPrice || f.minPrice) && (
                  <li>
                    • <Link href={hrefWith(f, { minPrice: undefined, maxPrice: undefined, page: undefined })} className="font-semibold text-brand-700 underline-offset-2 hover:underline">Try increasing your budget</Link>
                  </li>
                )}
                {f.q && (
                  <li>
                    • <Link href={hrefWith(f, { q: undefined, page: undefined })} className="font-semibold text-brand-700 underline-offset-2 hover:underline">Try a nearby area</Link> — search the whole {city?.name ?? "city"}
                  </li>
                )}
                {(f.type || f.minArea || f.maxArea) && (
                  <li>
                    • <Link href={hrefWith(f, { type: undefined, minArea: undefined, maxArea: undefined, unit: undefined, page: undefined })} className="font-semibold text-brand-700 underline-offset-2 hover:underline">Try other land types or sizes</Link>
                  </li>
                )}
                <li>
                  • <Link href={resetHref} className="font-semibold text-brand-700 underline-offset-2 hover:underline">Browse all listings</Link>
                </li>
              </ul>
              <div className="mx-auto mt-8 max-w-sm rounded-2xl bg-white p-5 ring-1 ring-line">
                <p className="font-semibold">Can&apos;t find what you&apos;re looking for?</p>
                <p className="mt-1 text-sm text-muted">Tell us what land you need. We&apos;ll message you when something matching is listed.</p>
                <ButtonA
                  className="mt-4 w-full"
                  href={supportWhatsAppLink(
                    `Hi, I'm looking for ${f.type ? LAND_TYPES[f.type].label.toLowerCase() : "land"}${f.q ? ` near ${f.q}` : ""} in ${place}${f.maxPrice ? `, budget up to ${formatPrice(f.maxPrice)}` : ""}. Please tell me when something is listed.`,
                  )}
                  target="_blank"
                  rel="noopener"
                >
                  <WhatsAppIcon /> Tell us what you need
                </ButtonA>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
