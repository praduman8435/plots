import { ArrowRight, MapPin } from "lucide-react";
import Image from "next/image";
import { IntentLink } from "@/components/ui/intent-link";
import { LinkPending } from "@/components/ui/link-pending";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { freshnessLabel } from "@/lib/freshness";
import { LAND_TYPES, formatPricePerUnit, placeName } from "@/lib/land";
import { formatArea } from "@/lib/units";
import type { PropertyCardData } from "@/server/listings/queries";

/**
 * Easy to scan: photo, price (and rate per unit), size + type, place, freshness.
 * No description — that lives on the property page. One tap opens the property.
 * `priority`: the first card on a page — its photo is the likely LCP, so it is
 * fetched eagerly at high priority (not preloaded: which card is "first on
 * screen" depends on the viewport).
 */
export function PropertyCard({
  p,
  priority = false,
  className,
  sizes = "(min-width: 1280px) 25vw, (min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw",
}: {
  p: PropertyCardData;
  priority?: boolean;
  className?: string;
  sizes?: string;
}) {
  const cover = p.images[0];
  const fresh = freshnessLabel(p);
  const perUnit = formatPricePerUnit(p.price, p.area, p.areaUnit);

  return (
    <article className={cn("group relative flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-line transition duration-300 hover:-translate-y-0.5 hover:shadow-card hover:ring-line-strong", className)}>
      <div className="relative aspect-[3/2] overflow-hidden bg-mist">
        {cover ? (
          <Image src={cover.url} alt="" fill sizes={sizes} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} className="object-cover transition duration-500 ease-out group-hover:scale-[1.03]" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-faint">Photos coming soon</div>
        )}
        <span className="absolute top-2.5 left-2.5 rounded-full bg-white/95 px-2.5 py-1 text-[11px] leading-none font-semibold text-ink shadow-soft">{LAND_TYPES[p.landType].short}</span>
      </div>

      <div className="flex flex-1 flex-col px-4 pt-3.5 pb-3.5">
        <p className="flex min-w-0 items-baseline gap-2">
          <span className="tabular text-lg leading-tight font-bold tracking-tight text-ink">{formatPrice(p.price)}</span>
          {perUnit && <span className="tabular truncate text-xs text-muted">{perUnit}</span>}
        </p>
        <h3 className="mt-1 truncate text-sm font-semibold text-ink-soft">
          <IntentLink href={`/property/${p.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {formatArea(p.area, p.areaUnit)} · {LAND_TYPES[p.landType].label}
            <LinkPending className="absolute inset-x-0 top-0 z-10 h-[3px]" />
          </IntentLink>
        </h3>
        <p className="mt-1 flex items-center gap-1 text-[13px] text-muted">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {placeName(p)}, {p.city.name}
          </span>
        </p>
        <div className="mt-auto pt-3.5">
          <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
            <p className={cn("flex min-w-0 items-center gap-1.5 text-xs font-medium", fresh.fresh ? "text-brand-700" : "text-muted")} title={fresh.text}>
              {fresh.fresh && <span className="size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />}
              <span className="truncate">{fresh.short}</span>
              {fresh.fresh && <span className="sr-only">, available</span>}
            </p>
            <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-brand-700" aria-hidden>
              View <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
