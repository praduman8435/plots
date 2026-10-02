import { BellRing, CalendarCheck, Clock, EyeOff, PhoneMissed, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ContactButtons } from "@/components/admin/contact-buttons";
import { now } from "@/components/admin/data";
import { hoursLeft, timeAgo, timeAgoInline } from "@/components/admin/format";
import { AvailabilityRowActions } from "@/components/admin/listing-actions";
import { ListingThumb } from "@/components/admin/listing-thumb";
import { PageHeader } from "@/components/admin/page-header";
import { RunChecksButton } from "@/components/admin/run-checks-button";
import { requireAdmin } from "@/lib/admin/require";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { availabilityWhere } from "@/server/admin/availability";
import { AVAILABILITY } from "@/server/listings/service";

export const metadata: Metadata = { title: "Availability" };

const include = {
  city: { select: { name: true } },
  seller: { select: { id: true, name: true, code: true, phone: true } },
  images: { orderBy: { position: "asc" as const }, take: 1, select: { url: true } },
};
const LIMIT = 100;

export default async function AdminAvailabilityPage() {
  await requireAdmin();
  const at = now();
  const where = availabilityWhere(at);

  const [waiting, unreachable, unavailable, due] = await Promise.all([
    db.property.findMany({ where: where.waiting, orderBy: { availabilityCheckSentAt: "asc" }, take: LIMIT, include }),
    db.property.findMany({ where: where.unreachable, orderBy: { lastAvailabilityCheckAt: "asc" }, take: LIMIT, include }),
    db.property.findMany({ where: where.unavailable, orderBy: { updatedAt: "desc" }, take: LIMIT, include }),
    db.property.findMany({
      where: where.due,
      orderBy: [{ lastConfirmedAt: { sort: "asc", nulls: "first" } }, { publishedAt: "asc" }],
      take: LIMIT,
      include,
    }),
  ]);

  const lastSeen = (p: { lastConfirmedAt: Date | null; publishedAt: Date | null }, lower = false) => {
    const s = p.lastConfirmedAt
      ? `Last confirmed ${timeAgoInline(p.lastConfirmedAt, at)}`
      : p.publishedAt
        ? `Published ${timeAgoInline(p.publishedAt, at)}, never confirmed`
        : "Never confirmed";
    return lower ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  };

  return (
    <>
      <PageHeader
        title="Availability"
        description="Sellers get a WhatsApp “still available?” check every 7 days; no reply within 24 h of a delivered check hides the plot (never marks it sold)."
        actions={<RunChecksButton />}
      />

      <div className="flex flex-col gap-10">
        <Group
          icon={BellRing}
          title="Waiting for reply"
          description="Check delivered. Call or WhatsApp the seller if it’s urgent, then mark it."
          empty="No checks waiting for a reply."
          rows={waiting.map((p) => {
            const h = hoursLeft(p.availabilityCheckSentAt!, AVAILABILITY.replyWithinMs, at);
            return {
              p,
              note: h > 0 ? `Sent ${timeAgo(p.availabilityCheckSentAt!, at)} · ${h} h left to reply` : `Sent ${timeAgo(p.availabilityCheckSentAt!, at)} · hides at the next run`,
              warn: h <= 6,
              actions: <AvailabilityRowActions propertyId={p.id} />,
            };
          })}
        />
        <Group
          icon={PhoneMissed}
          tone="amber"
          title="Couldn’t reach seller"
          description="The check wasn’t delivered (WhatsApp only allows it within 24 h of their last message unless a template is set up). No timer is running — call them."
          empty="Every check was delivered."
          rows={unreachable.map((p) => ({
            p,
            note: `Tried ${timeAgo(p.lastAvailabilityCheckAt!, at)} · not delivered`,
            warn: true,
            actions: <AvailabilityRowActions propertyId={p.id} />,
          }))}
        />
        <Group
          icon={EyeOff}
          title="Unavailable — no reply"
          description="Hidden from buyers. A YES from the seller (or Mark available) puts it back live."
          empty="Nothing hidden for missing replies."
          rows={unavailable.map((p) => ({
            p,
            note: `Hidden ${timeAgo(p.updatedAt, at)} · ${lastSeen(p, true)}`,
            actions: <AvailabilityRowActions propertyId={p.id} />,
          }))}
        />
        <Group
          icon={Clock}
          title="Due for a check"
          description="Live, not confirmed in 7+ days. The weekly run asks these sellers automatically."
          empty="Every live plot was confirmed or published in the last 7 days."
          rows={due.map((p) => ({
            p,
            note: lastSeen(p),
            actions: <AvailabilityRowActions propertyId={p.id} />,
          }))}
        />
      </div>
    </>
  );
}

type Row = {
  p: {
    id: string;
    code: string;
    title: string;
    price: bigint;
    city: { name: string };
    seller: { id: string; name: string; code: string; phone: string };
    images: { url: string }[];
  };
  note: string;
  warn?: boolean;
  actions: ReactNode;
};

function Group({
  icon: Icon,
  tone,
  title,
  description,
  empty,
  rows,
}: {
  icon: LucideIcon;
  tone?: "amber";
  title: string;
  description: string;
  empty: string;
  rows: Row[];
}) {
  return (
    <section>
      <div className="mb-3 flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl",
            tone === "amber" && rows.length > 0 ? "bg-amber-50 text-amber-700" : "bg-brand-50 text-brand-600",
          )}
        >
          <Icon className="size-[18px]" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-ink">
            {title} <span className="tabular text-base font-semibold text-muted">{rows.length}</span>
          </h2>
          <p className="text-sm text-muted">{description}</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="flex items-center gap-2 rounded-2xl border border-dashed border-line-strong bg-white px-4 py-5 text-sm text-muted">
          <CalendarCheck className="size-4 shrink-0 text-brand-500" aria-hidden /> {empty}
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
          {rows.map(({ p, note, warn, actions }) => (
            <li key={p.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:gap-5">
              <div className="flex min-w-0 flex-1 gap-3">
                <ListingThumb url={p.images[0]?.url} alt="" sizes="72px" className="size-16 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/listings/${p.id}`} className="line-clamp-1 font-semibold text-ink hover:text-brand-700">
                    {p.title}
                  </Link>
                  <p className="tabular truncate text-sm text-muted">
                    <span className="font-bold text-brand-800">{formatPrice(p.price)}</span> · {p.city.name} · {p.code}
                  </p>
                  <p className={warn ? "text-xs font-semibold text-amber-700" : "text-xs text-muted"}>{note}</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 lg:w-56 lg:shrink-0">
                <Link href={`/admin/sellers/${p.seller.id}`} className="min-w-0 text-sm hover:text-brand-700">
                  <span className="block truncate font-medium text-ink">{p.seller.name}</span>
                  <span className="tabular block text-xs text-muted">{p.seller.code}</span>
                </Link>
                <ContactButtons phone={p.seller.phone} text={`Hi ${p.seller.name}, this is Plots. Is your property ${p.title} (${p.code}) still available?`} />
              </div>
              <div className="lg:shrink-0">{actions}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
