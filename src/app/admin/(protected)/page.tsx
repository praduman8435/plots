import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  EyeOff,
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
  const admin = await requireAdmin();
  const at = now();
  const weekAgo = daysAgo(7);

  const [pending, oldestPending, chats, availability, next, live, newPlots, enquiries7, newSellers, recentEnquiries] = await Promise.all([
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
  ]);

  const actions: Action[] = [
    pending > 0 && {
      key: "review",
      icon: ClipboardCheck,
      title: `Approve ${pending} new plot${pending === 1 ? "" : "s"}`,
      detail: oldestPending ? `Oldest has been waiting ${waitingFor(oldestPending.createdAt, at)}. Sellers are told on WhatsApp.` : undefined,
      href: "/admin/listings?status=PENDING",
      cta: "Review",
      urgent: Boolean(oldestPending && at.getTime() - oldestPending.createdAt.getTime() > 12 * 3_600_000),
    },
    chats > 0 && {
      key: "chats",
      icon: MessageCircle,
      title: `Reply to ${chats} seller chat${chats === 1 ? "" : "s"}`,
      detail: "Unread messages, or sellers who asked to talk to a person.",
      href: "/admin/whatsapp",
      cta: "Open chats",
    },
    availability.unreachable > 0 && {
      key: "unreachable",
      icon: PhoneOff,
      title: `Call ${availability.unreachable} seller${availability.unreachable === 1 ? "" : "s"} we couldn't reach`,
      detail: "The weekly “still available?” message didn't go through. Confirm by phone.",
      href: "/admin/availability",
      cta: "Follow up",
    },
    availability.unavailable > 0 && {
      key: "unavailable",
      icon: EyeOff,
      title: `${availability.unavailable} plot${availability.unavailable === 1 ? "" : "s"} hidden after no reply`,
      detail: "Ask the seller if it's still available — one tap brings it back.",
      href: "/admin/availability",
      cta: "Check",
    },
  ].filter(Boolean) as Action[];

  const hello = at.getHours() < 12 ? "Good morning" : at.getHours() < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="mx-auto max-w-3xl">
      {/* Headline: how much needs me? */}
      <header className="mb-6">
        <p className="text-sm font-medium text-muted">
          {hello}, {admin.name.split(/\s+/)[0]}
        </p>
        <h1 className="mt-1 text-[1.75rem] leading-tight font-extrabold tracking-tight text-ink sm:text-3xl">
          {actions.length === 0 ? "You're all caught up" : `${actions.length} thing${actions.length === 1 ? "" : "s"} need${actions.length === 1 ? "s" : ""} you`}
        </h1>
      </header>

      {/* To-do */}
      {actions.length === 0 ? (
        <div className="flex items-center gap-4 rounded-3xl bg-brand-50 p-5 ring-1 ring-brand-100">
          <CheckCircle2 className="size-8 shrink-0 text-brand-600" aria-hidden />
          <div>
            <p className="font-semibold text-brand-900">Nothing to approve, no chats waiting.</p>
            <p className="text-sm text-brand-800/80">New plots and seller messages will show up here.</p>
          </div>
        </div>
      ) : (
        <ul className="space-y-2.5" aria-label="To do">
          {actions.map((a) => (
            <li key={a.key}>
              <Link
                href={a.href}
                className={cn(
                  "group flex items-center gap-4 rounded-2xl bg-white p-4 shadow-soft ring-1 transition hover:shadow-card sm:p-5",
                  a.urgent ? "ring-amber-300" : "ring-line hover:ring-brand-200",
                )}
              >
                <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", a.urgent ? "bg-amber-50 text-amber-700" : "bg-brand-50 text-brand-700")}>
                  <a.icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-ink">{a.title}</span>
                  {a.detail && <span className="mt-0.5 block text-sm leading-snug text-muted">{a.detail}</span>}
                </span>
                <span className="hidden shrink-0 items-center gap-1 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-brand transition group-hover:bg-brand-700 sm:inline-flex">
                  {a.cta} <ArrowRight className="size-4" aria-hidden />
                </span>
                <ArrowRight className="size-5 shrink-0 text-brand-600 sm:hidden" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* The very next plot to approve — decide it right here */}
      {next[0] && (
        <section className="mt-8" aria-labelledby="next-heading">
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 id="next-heading" className="text-lg font-bold text-ink">
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

      <section className="mt-10" aria-labelledby="week-heading">
        <h2 id="week-heading" className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">
          This week
        </h2>
        <dl className="grid grid-cols-2 overflow-hidden rounded-2xl bg-white ring-1 ring-line sm:grid-cols-4">
          <Stat href="/admin/listings?status=ACTIVE" label="Live plots" value={live} />
          <Stat href="/admin/listings" label="New plots" value={newPlots} />
          <Stat href="/admin/enquiries?range=7" label="Buyer enquiries" value={enquiries7} />
          <Stat href="/admin/sellers" label="New sellers" value={newSellers} />
        </dl>
        <Link href="/admin/insights" className="mt-2 inline-block text-sm font-semibold text-brand-700 hover:text-brand-800">
          See full insights →
        </Link>
      </section>

      {recentEnquiries.length > 0 && (
        <section className="mt-10" aria-labelledby="enq-heading">
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

type Action = { key: string; icon: LucideIcon; title: string; detail?: string; href: string; cta: string; urgent?: boolean };

function Stat({ href, label, value }: { href: string; label: string; value: number }) {
  return (
    <Link href={href} className="border-line p-4 transition hover:bg-mist [&:not(:last-child)]:border-r max-sm:[&:nth-child(2)]:border-r-0 max-sm:[&:nth-child(-n+2)]:border-b">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="tabular mt-1 text-xl font-extrabold text-ink">{formatNumber(value)}</dd>
    </Link>
  );
}
