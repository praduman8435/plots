import { ArrowUpRight, ChevronRight, Clock, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { formatArea, formatSqftHint } from "@/lib/units";
import type { ReviewQueueItem } from "@/server/admin/review";
import { EditedBadge, IdentityBadge, PhoneVerifiedBadge, SellerTypeBadge, SourceBadge } from "./badges";
import { DuplicateWarning } from "./duplicate-warning";
import { formatDateTime, landTypeLabel, timeAgo } from "./format";
import { ReviewActions } from "./listing-actions";
import { ListingThumb } from "./listing-thumb";

/** A pending listing in the review queue: everything needed to decide, plus one-tap Approve / Reject / Edit. */
export function ReviewCard({ p }: { p: ReviewQueueItem }) {
  const edited = p.status === "PENDING" && p.publishedAt !== null;
  const sqftHint = formatSqftHint(p.areaSqft, p.areaUnit);
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
      <Photos p={p} />
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <SourceBadge source={p.source} />
          {edited && <EditedBadge />}
          <span className="tabular ml-auto text-xs font-medium text-faint">{p.code}</span>
        </div>

        <div className="min-w-0">
          <Link href={`/admin/listings/${p.id}`} className="group flex items-start gap-1">
            <h3 className="line-clamp-2 text-[16px] leading-snug font-bold text-ink group-hover:text-brand-800">{p.title}</h3>
            <ChevronRight className="mt-0.5 size-4 shrink-0 text-faint group-hover:text-brand-600" aria-hidden />
          </Link>
          <p className="mt-1 flex items-start gap-1 text-sm text-muted">
            <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0">
              {[p.village, p.locality, p.city.name].filter(Boolean).join(", ")}
              {p.latitude != null && p.longitude != null && (
                <>
                  {" · "}
                  <a
                    href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 font-semibold whitespace-nowrap text-brand-700 hover:underline"
                  >
                    Map pin <ArrowUpRight className="size-3.5" aria-hidden />
                  </a>
                </>
              )}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="tabular text-lg font-extrabold text-brand-800">{formatPrice(p.price)}</span>
          <span className="tabular text-sm font-semibold text-ink">
            {formatArea(p.area, p.areaUnit)}
            {sqftHint && <span className="font-normal text-faint"> · {sqftHint}</span>}
          </span>
          <span className="text-sm text-muted">{landTypeLabel(p.landType)}</span>
        </div>

        <p className="line-clamp-3 text-sm leading-relaxed whitespace-pre-line text-ink-soft">{p.description}</p>

        <div className="rounded-xl bg-mist px-3 py-2.5 text-sm">
          <Link href={`/admin/sellers/${p.seller.id}`} className="flex flex-wrap items-baseline gap-x-2 hover:text-brand-800">
            <span className="font-semibold text-ink">{p.seller.name}</span>
            <span className="tabular text-xs text-muted">{p.seller.code}</span>
          </Link>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <PhoneVerifiedBadge verified={Boolean(p.seller.phoneVerifiedAt)} />
            <IdentityBadge status={p.seller.identityStatus} />
            <SellerTypeBadge type={p.seller.sellerType} />
          </div>
        </div>

        <DuplicateWarning duplicates={p.duplicates} />

        <p className="flex items-center gap-1 text-xs text-muted">
          <Clock className="size-3.5" aria-hidden />
          Submitted {timeAgo(p.createdAt)} · {formatDateTime(p.createdAt)}
        </p>

        <ReviewActions propertyId={p.id} className="mt-auto" />
      </div>
    </article>
  );
}

/** Swipeable photo strip — reviewers need to see every photo, not just the cover. */
function Photos({ p }: { p: ReviewQueueItem }) {
  if (p.images.length === 0) {
    return <ListingThumb url={null} alt="" sizes="100vw" className="aspect-[16/7]" />;
  }
  if (p.images.length === 1) {
    return (
      <a href={p.images[0].url} target="_blank" rel="noreferrer" className="relative block aspect-[16/9] bg-mist">
        <Image src={p.images[0].url} alt={`Photo of ${p.title}`} fill sizes="(min-width: 1280px) 560px, 100vw" className="object-cover" />
      </a>
    );
  }
  return (
    <div className="relative">
      <ul className="no-scrollbar flex snap-x snap-mandatory gap-1 overflow-x-auto" aria-label={`${p._count.images} photos`}>
        {p.images.map((img, i) => (
          <li key={img.id} className="relative aspect-[4/3] w-[78%] shrink-0 snap-start bg-mist sm:w-[46%]">
            <a href={img.url} target="_blank" rel="noreferrer" className="absolute inset-0">
              <Image src={img.url} alt={`Photo ${i + 1} of ${p.title}`} fill sizes="(min-width: 640px) 280px, 78vw" className="object-cover" />
            </a>
          </li>
        ))}
      </ul>
      <span className="pointer-events-none absolute right-2 bottom-2 rounded-full bg-brand-950/75 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
        {p._count.images} photos · swipe
      </span>
    </div>
  );
}
