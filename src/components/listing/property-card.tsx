import { ArrowRight, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { freshnessLabel } from "@/lib/freshness";
import { LAND_TYPES, placeName } from "@/lib/land";
import { formatArea } from "@/lib/units";
import type { PropertyCardData } from "@/server/listings/queries";

/** Easy to scan: photo, price, size + type, place, freshness. One tap opens the property. */
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

  return (
    <article className={cn("group relative flex flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-line transition duration-300 hover:shadow-card", className)}>
      <div className="relative aspect-[4/3] overflow-hidden bg-mist">
        {cover ? (
          <Image src={cover.url} alt="" fill sizes={sizes} priority={priority} className="object-cover transition duration-500 ease-out group-hover:scale-[1.03]" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-faint">Photos coming soon</div>
        )}
        <span className="absolute top-3 left-3 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-ink shadow-soft">{LAND_TYPES[p.landType].short}</span>
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <p className="tabular text-[1.4rem] leading-none font-extrabold tracking-tight text-ink">{formatPrice(p.price)}</p>
        <h3 className="mt-2 text-[15px] font-semibold text-ink">
          <Link href={`/property/${p.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {formatArea(p.area, p.areaUnit)} · {LAND_TYPES[p.landType].label}
          </Link>
        </h3>
        <p className="mt-1 flex items-center gap-1 text-sm text-muted">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {placeName(p)}, {p.city.name}
          </span>
        </p>
        {p.description && <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-ink-soft">{p.description}</p>}
        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <p className={cn("flex items-center gap-1.5 text-xs font-medium", fresh.fresh ? "text-brand-700" : "text-muted")}>
            {fresh.fresh && <span className="size-1.5 rounded-full bg-brand-500" aria-hidden />}
            {fresh.text}
          </p>
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-700" aria-hidden>
            View <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </article>
  );
}
