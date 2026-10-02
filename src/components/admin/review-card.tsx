import { ArrowUpRight, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { formatArea, formatSqftHint } from "@/lib/units";
import type { ReviewQueueItem } from "@/server/admin/review";
import { EditedBadge, SourceBadge } from "./badges";
import { DuplicateWarning } from "./duplicate-warning";
import { landTypeLabel, timeAgo } from "./format";
import { ReviewActions } from "./listing-actions";
import { ListingThumb } from "./listing-thumb";

/** A pending listing in the review queue: everything needed to decide, plus one-tap Approve / Reject / Edit. */
export function ReviewCard({ p }: { p: ReviewQueueItem }) {
  const edited = p.status === "PENDING" && p.publishedAt !== null;
  const sqftHint = formatSqftHint(p.areaSqft, p.areaUnit);
  const phoneOk = Boolean(p.seller.phoneVerifiedAt);
  const idOk = p.seller.identityStatus === "VERIFIED";
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
      <Photos p={p} />
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        {/* What + how much */}
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <p className="tabular text-xl font-extrabold tracking-tight text-ink">{formatPrice(p.price)}</p>
            <Link href={`/admin/listings/${p.id}`} className="tabular shrink-0 text-xs font-medium text-faint hover:text-brand-700">
              {p.code} ›
            </Link>
          </div>
          <p className="mt-0.5 text-[15px] font-semibold text-ink">
            {formatArea(p.area, p.areaUnit)} · {landTypeLabel(p.landType)}
            {sqftHint && <span className="font-normal text-faint"> · {sqftHint}</span>}
          </p>
          <p className="mt-1 flex items-start gap-1 text-sm text-muted">
            <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0">
              {[p.village, p.locality, p.city.name].filter(Boolean).join(", ")}
              {p.latitude != null && p.longitude != null && (
                <a
                  href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1.5 inline-flex items-center gap-0.5 font-semibold whitespace-nowrap text-brand-700 hover:underline"
                >
                  Map <ArrowUpRight className="size-3" aria-hidden />
                </a>
              )}
            </span>
          </p>
        </div>

        {p.description && <p className="line-clamp-2 text-sm leading-relaxed text-ink-soft">{p.description}</p>}

        {/* Who — one quiet line, flagged only when something is missing */}
        <div className="flex items-center justify-between gap-3 rounded-xl bg-mist px-3 py-2 text-sm">
          <Link href={`/admin/sellers/${p.seller.id}`} className="min-w-0 truncate font-semibold text-ink hover:text-brand-800">
            {p.seller.name}
            <span className="ml-1.5 text-xs font-normal text-muted">{p.seller.sellerType === "BROKER" ? "Broker" : "Seller"}</span>
          </Link>
          <p className="flex shrink-0 items-center gap-2 text-xs font-medium">
            <span className={phoneOk ? "text-brand-700" : "text-amber-700"}>{phoneOk ? "✓ Phone" : "Phone not verified"}</span>
            <span className={idOk ? "text-brand-700" : "text-muted"}>{idOk ? "✓ ID" : "ID not verified"}</span>
          </p>
        </div>

        <DuplicateWarning duplicates={p.duplicates} />

        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span>Submitted {timeAgo(p.createdAt)}</span>
          <span aria-hidden>·</span>
          <SourceBadge source={p.source} />
          {edited && <EditedBadge />}
        </p>

        <ReviewActions propertyId={p.id} className="mt-auto pt-1" />
      </div>
    </article>
  );
}

/** Swipeable photo strip — reviewers need to see every photo, not just the cover. */
function Photos({ p }: { p: ReviewQueueItem }) {
  if (p.images.length === 0) {
    return <ListingThumb url={null} alt="" sizes="100vw" className="aspect-[16/8]" />;
  }
  if (p.images.length === 1) {
    return (
      <a href={p.images[0].url} target="_blank" rel="noreferrer" className="relative block aspect-[16/10] bg-mist">
        <Image src={p.images[0].url} alt={`Photo of ${p.title}`} fill sizes="(min-width: 1280px) 560px, 100vw" className="object-cover" />
      </a>
    );
  }
  return (
    <div className="relative">
      <ul className="no-scrollbar flex snap-x snap-mandatory gap-1 overflow-x-auto" aria-label={`${p._count.images} photos`}>
        {p.images.map((img, i) => (
          <li key={img.id} className="relative aspect-[16/10] w-[82%] shrink-0 snap-start bg-mist sm:w-[46%]">
            <a href={img.url} target="_blank" rel="noreferrer" className="absolute inset-0">
              <Image src={img.url} alt={`Photo ${i + 1} of ${p.title}`} fill sizes="(min-width: 640px) 280px, 78vw" className="object-cover" />
            </a>
          </li>
        ))}
      </ul>
      <span className="pointer-events-none absolute right-2 bottom-2 rounded-full bg-brand-950/75 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
        {p._count.images} photos
      </span>
    </div>
  );
}
