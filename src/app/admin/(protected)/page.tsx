import {
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  EyeOff,
  Flag,
  Hourglass,
  MessageCircle,
  PhoneOff,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { daysAgo, now } from "@/components/admin/data";
import { EnquiryList } from "@/components/admin/enquiry-list";
import { ReviewCard } from "@/components/admin/review-card";
import { requireAdmin } from "@/lib/admin/require";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import { countAvailabilityAttention } from "@/server/admin/availability";
import { reportCounts } from "@/server/admin/reports";
import { loadReviewQueue } from "@/server/admin/review";

export const metadata: Metadata = { title: "Today" };

/** "Waiting 5h" / "waiting 2 days" from a date. */
function waitingFor(since: Date, at: Date) {
  const h = Math.max(0, Math.floor((at.getTime() - since.getTime()) / 3_600_000));
  if (h < 1) return "just now";
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
}

/**
 * Admin home = a to-do list. It answers one question: "what do I need to do
 * right now?" — only actions with something to do are shown, most urgent first.
 */
export default async function AdminTodayPage() {
  await requireAdmin();
  const at = now();
  const weekAgo = daysAgo(7);

  const [pending, oldestPending, chats, availability, next, live, newPlots, enquiries7, newSellers, recentEnquiries, reports] = await Promise.all([
    db.property.count({ where: { status: "PENDING" } }),
    db.property.findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    db.whatsAppConversation.count({ where: { OR: [{ unreadCount: { gt: 0 } }, { step: "HUMAN" }] } }),
    countAvailabilityAttention(at),
    loadReviewQueue({ take: 1 }),
    db.property.count({ where: { status: "ACTIVE" } }),
    db.property.count({ where: { createdAt: { gte: weekAgo } } }),
    db.enquiry.count({ where: { createdAt: { gte: weekAgo } } }),
    db.seller.count({ where: { createdAt: { gte: weekAgo } } }),
    db.enquiry.findMany({
      orderBy: { createdAt: "desc" },
      take: 3,
      include: { property: { select: { id: true, title: true, code: true, seller: { select: { id: true, name: true, code: true } } } } },
    }),
    reportCounts(),
  ]);

  const actions: Action[] = [
    pending > 0 && {
      key: "review",
      icon: ClipboardCheck,
      title: `Approve ${pending} plot${pending === 1 ? "" : "s"}`,
      detail: oldestPending ? `Oldest waiting ${waitingFor(oldestPending.createdAt, at)}` : undefined,
      href: "/admin/listings?status=PENDING",
      cta: "Review",
      urgent: Boolean(oldestPending && at.getTime() - oldestPending.createdAt.getTime() > 12 * 3_600_000),
    },
    reports.PENDING > 0 && {
      key: "reports",
      icon: Flag,
      title: `Review ${reports.PENDING} report${reports.PENDING === 1 ? "" : "s"}`,
      detail: reports.fraudOpen > 0 ? `${reports.fraudOpen} about possible fraud` : "Buyers flagged a plot or a seller",
      href: "/admin/reports?status=PENDING",
      cta: "Review",
      urgent: reports.fraudOpen > 0,
      badge: "Fraud",
    },
    chats > 0 && {
      key: "chats",
      icon: MessageCircle,
      title: `Reply to ${chats} chat${chats === 1 ? "" : "s"}`,
      detail: "Unread, or asked for a person",
      href: "/admin/whatsapp",
      cta: "Open chats",
    },
    availability.unreachable > 0 && {
      key: "unreachable",
      icon: PhoneOff,
      title: `Call ${availability.unreachable} seller${availability.unreachable === 1 ? "" : "s"}`,
      detail: "Weekly check didn't reach them",
      href: "/admin/availability",
      cta: "Follow up",
    },
    availability.unavailable > 0 && {
      key: "unavailable",
      icon: EyeOff,
      title: `${availability.unavailable} plot${availability.unavailable === 1 ? "" : "s"} hidden — no reply`,
      detail: "Ask if still available",
      href: "/admin/availability",
      cta: "Check",
    },
  ].filter(Boolean) as Action[];

  const hello = at.getHours() < 12 ? "Good morning" : at.getHours() < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="mx-auto max-w-3xl">
      {/* Headline: how much needs me? */}
      <header className="mb-5">
        <p className="text-xs font-medium text-muted">{hello}</p>
        <h1 className="mt-0.5 text-2xl leading-tight font-bold tracking-tight text-ink">
          {actions.length === 0 ? "All caught up" : `${actions.length} to do`}
        </h1>
      </header>

      {/* To-do */}
      {actions.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl bg-brand-50 px-4 py-4 ring-1 ring-brand-100">
          <CheckCircle2 className="size-6 shrink-0 text-brand-600" aria-hidden />
          <p className="text-sm font-medium text-brand-900">Nothing to approve and no chats waiting. New items will show up here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-white ring-1 ring-line" aria-label="To do">
          {actions.map((a) => (
            <li key={a.key}>
              <Link href={a.href} className="group flex items-center gap-3 px-4 py-3.5 transition active:bg-mist hover:bg-mist/60">
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", a.urgent ? "bg-amber-50 text-amber-700" : "bg-brand-50 text-brand-700")}>
                  <a.icon className="size-[18px]" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-ink">{a.title}</span>
                  {a.detail && <span className="block truncate text-[13px] text-muted">{a.detail}</span>}
                </span>
                {a.urgent && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{a.badge ?? "Waiting"}</span>}
                <ChevronRight className="size-4 shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* The very next plot to approve — decide it right here */}
      {next[0] && (
        <section className="mt-6" aria-labelledby="next-heading">
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 id="next-heading" className="text-base font-bold text-ink">
              Next to approve
            </h2>
            {pending > 1 && (
              <Link href="/admin/listings?status=PENDING" className="text-sm font-semibold text-brand-700 hover:text-brand-800">
                {pending - 1} more →
              </Link>
            )}
          </div>
          <ReviewCard p={next[0]} />
        </section>
      )}

      {/* Quiet context: no action needed */}
      {availability.waiting > 0 && (
        <p className="mt-6 flex items-center gap-2 text-sm text-muted">
          <Hourglass className="size-4 shrink-0" aria-hidden />
          {availability.waiting} plot{availability.waiting === 1 ? " is" : "s are"} waiting for the seller&apos;s YES/NO — nothing to do yet.
        </p>
      )}

      <section className="mt-8" aria-labelledby="week-heading">
        <h2 id="week-heading" className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">
          This week
        </h2>
        <dl className="grid grid-cols-2 overflow-hidden rounded-2xl bg-white ring-1 ring-line sm:grid-cols-4">
          <Stat href="/admin/listings?status=ACTIVE" label="Live plots" value={live} />
          <Stat href="/admin/listings" label="New plots" value={newPlots} />
          <Stat href="/admin/enquiries?range=7" label="Buyer enquiries" value={enquiries7} />
          <Stat href="/admin/sellers" label="New sellers" value={newSellers} />
        </dl>
        <Link href="/admin/insights" className="mt-2 inline-block text-[13px] font-semibold text-brand-700 hover:text-brand-800">
          Full insights →
        </Link>
      </section>

      {recentEnquiries.length > 0 && (
        <section className="mt-8" aria-labelledby="enq-heading">
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 id="enq-heading" className="text-sm font-semibold tracking-wide text-muted uppercase">
              Latest buyer enquiries
            </h2>
            <Link href="/admin/enquiries" className="text-sm font-semibold text-brand-700 hover:text-brand-800">
              All →
            </Link>
          </div>
          <EnquiryList enquiries={recentEnquiries} />
        </section>
      )}
    </div>
  );
}

type Action = { key: string; icon: LucideIcon; title: string; detail?: string; href: string; cta: string; urgent?: boolean; badge?: string };

function Stat({ href, label, value }: { href: string; label: string; value: number }) {
  return (
    <Link href={href} className="border-line px-4 py-3 transition hover:bg-mist [&:not(:last-child)]:border-r max-sm:[&:nth-child(2)]:border-r-0 max-sm:[&:nth-child(-n+2)]:border-b">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="tabular mt-0.5 text-lg font-bold text-ink">{formatNumber(value)}</dd>
    </Link>
  );
}
