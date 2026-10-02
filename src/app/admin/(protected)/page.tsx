import { ArrowRight, CalendarCheck, ClipboardCheck, Inbox, MapPinned, PhoneIncoming, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { daysAgo } from "@/components/admin/data";
import { EmptyState } from "@/components/admin/empty-state";
import { EnquiryList } from "@/components/admin/enquiry-list";
import { PageHeader } from "@/components/admin/page-header";
import { ReviewCard } from "@/components/admin/review-card";
import { ButtonLink } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin/require";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import { countAvailabilityAttention } from "@/server/admin/availability";
import { loadReviewQueue } from "@/server/admin/review";

export const metadata: Metadata = { title: "Overview" };

const QUEUE_SIZE = 6;

export default async function AdminOverviewPage() {
  const admin = await requireAdmin();

  const [live, pendingCount, enq7, availability, queue, recentEnquiries] = await Promise.all([
    db.property.count({ where: { status: "ACTIVE" } }),
    db.property.count({ where: { status: "PENDING" } }),
    db.enquiry.count({ where: { createdAt: { gte: daysAgo(7) } } }),
    countAvailabilityAttention(),
    loadReviewQueue({ take: QUEUE_SIZE }),
    db.enquiry.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { property: { select: { id: true, title: true, code: true, seller: { select: { id: true, name: true, code: true } } } } },
    }),
  ]);

  const firstName = admin.name.split(/\s+/)[0];
  const availabilityParts = [
    availability.waiting && `${availability.waiting} awaiting`,
    availability.unreachable && `${availability.unreachable} unreachable`,
    availability.unavailable && `${availability.unavailable} unavailable`,
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title="Overview"
        description={`Hi ${firstName} — ${
          pendingCount > 0 ? `${pendingCount} plot${pendingCount === 1 ? " is" : "s are"} waiting for approval.` : "nothing is waiting for approval."
        }`}
      />

      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Tile href="/admin/listings?status=ACTIVE" icon={MapPinned} label="Live listings" value={live} />
        <Tile
          href="/admin/listings?status=PENDING"
          icon={ClipboardCheck}
          label="Pending approval"
          value={pendingCount}
          tone={pendingCount > 0 ? "amber" : undefined}
        />
        <Tile href="/admin/enquiries?range=7" icon={PhoneIncoming} label="New enquiries (7 days)" value={enq7} />
        <Tile
          href="/admin/availability"
          icon={CalendarCheck}
          label="Need availability attention"
          value={availability.total}
          sub={availabilityParts.join(" · ") || "All good"}
          tone={availability.total > 0 ? "amber" : undefined}
        />
      </section>

      <section className="mt-10" aria-labelledby="queue-heading">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 id="queue-heading" className="text-lg font-bold text-ink">
              Review queue
            </h2>
            <p className="text-sm text-muted">Oldest first. Approving notifies the seller on WhatsApp.</p>
          </div>
          {pendingCount > QUEUE_SIZE && (
            <ButtonLink href="/admin/listings?status=PENDING" variant="ghost" size="sm">
              All {pendingCount} <ArrowRight />
            </ButtonLink>
          )}
        </div>
        {queue.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="Nothing to review">
            New and edited plots from WhatsApp, the seller portal and your team appear here.
          </EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {queue.map((p) => (
              <ReviewCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-10" aria-labelledby="enq-heading">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 id="enq-heading" className="text-lg font-bold text-ink">
              Recent enquiries
            </h2>
            <p className="text-sm text-muted">Every WhatsApp or Call tap by a buyer.</p>
          </div>
          <ButtonLink href="/admin/enquiries" variant="ghost" size="sm">
            View all <ArrowRight />
          </ButtonLink>
        </div>
        {recentEnquiries.length === 0 ? (
          <EmptyState icon={Inbox} title="No enquiries yet">
            When buyers tap WhatsApp or Call on a plot, you’ll see it here.
          </EmptyState>
        ) : (
          <EnquiryList enquiries={recentEnquiries} />
        )}
      </section>
    </>
  );
}

function Tile({
  href,
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: number;
  sub?: string;
  tone?: "amber";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex min-w-0 flex-col justify-between gap-3 rounded-2xl border bg-white p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-card sm:p-5",
        tone === "amber" ? "border-amber-200" : "border-line",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] leading-snug font-medium text-muted">{label}</span>
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-xl",
            tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-brand-50 text-brand-600",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <div className="min-w-0">
        <p className="tabular text-[1.75rem] leading-none font-extrabold tracking-tight text-ink">{formatNumber(value)}</p>
        {sub && <p className={cn("mt-1.5 text-xs leading-snug", tone === "amber" ? "text-amber-700" : "text-muted")}>{sub}</p>}
      </div>
    </Link>
  );
}
