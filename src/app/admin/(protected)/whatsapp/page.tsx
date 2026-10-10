import {
  FlaskConical,
  Hand,
  ImageIcon,
  MapPin,
  MessageCircle,
  Smartphone,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/admin/empty-state";
import { timeAgo } from "@/components/admin/format";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin/require";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { formatPhone } from "@/lib/phone";
import { site } from "@/lib/site";
import { getAiConfig } from "@/server/ai/config";
import { describeStep, toBotStep } from "@/server/whatsapp/bot";

export const metadata: Metadata = { title: "WhatsApp" };
// Always fresh: new messages arrive via the webhook at any time.
export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "human", label: "Needs a person" },
  { key: "unread", label: "Unread" },
  { key: "listing", label: "Listing now" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

const LISTING_STEPS = [
  "ASK_NAME",
  "ASK_SELLER_TYPE",
  "ASK_LAND_TYPE",
  "ASK_CITY",
  "ASK_LOCALITY",
  "ASK_AREA",
  "ASK_AREA_UNIT",
  "ASK_PRICE",
  "ASK_PHOTOS",
  "ASK_LOCATION",
  "ASK_DESCRIPTION",
  "CONFIRM",
];

export default async function WhatsAppInboxPage({
  searchParams,
}: PageProps<"/admin/whatsapp">) {
  await requireAdmin();
  const sp = await searchParams;
  const filter: FilterKey = FILTERS.some((f) => f.key === sp.filter)
    ? (sp.filter as FilterKey)
    : "all";

  const where =
    filter === "human"
      ? { step: "HUMAN" }
      : filter === "unread"
        ? { unreadCount: { gt: 0 } }
        : filter === "listing"
          ? { step: { in: LISTING_STEPS } }
          : {};

  const [conversations, counts] = await Promise.all([
    db.whatsAppConversation.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: {
        seller: { select: { code: true, name: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    Promise.all([
      db.whatsAppConversation.count(),
      db.whatsAppConversation.count({ where: { step: "HUMAN" } }),
      db.whatsAppConversation.count({ where: { unreadCount: { gt: 0 } } }),
      db.whatsAppConversation.count({ where: { step: { in: LISTING_STEPS } } }),
    ]),
  ]);
  const [total, human, unread, listing] = counts;
  const countFor: Record<FilterKey, number> = {
    all: total,
    human,
    unread,
    listing,
  };
  const now = new Date();

  return (
    <>
      <PageHeader
        title="WhatsApp"
        description="Every chat with the listing assistant. Take over any conversation to reply as a person."
        actions={
          <>
            <AiStatus />
            <ButtonLink
              href="/admin/whatsapp/simulator"
              variant="soft"
              size="sm"
            >
              <FlaskConical aria-hidden /> Open simulator
            </ButtonLink>
          </>
        }
      />

      <nav
        aria-label="Filter chats"
        className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0"
      >
        {FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <Link
              key={f.key}
              href={
                f.key === "all"
                  ? "/admin/whatsapp"
                  : `/admin/whatsapp?filter=${f.key}`
              }
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition",
                active
                  ? "border-brand-600 bg-brand-600 text-white shadow-brand"
                  : "border-line bg-white text-ink-soft hover:border-brand-200 hover:bg-brand-50/50",
              )}
            >
              {f.key === "human" && <Hand className="size-4" aria-hidden />}
              {f.label}
              <span
                className={cn(
                  "tabular rounded-full px-1.5 text-xs",
                  active ? "bg-white/20" : "bg-mist text-muted",
                )}
              >
                {countFor[f.key]}
              </span>
            </Link>
          );
        })}
      </nav>

      {conversations.length === 0 ? (
        filter === "all" ? (
          <EmptyState icon={MessageCircle} title="No WhatsApp chats yet">
            <p>
              Sellers reach the assistant by tapping <b>Sell on WhatsApp</b> on
              the website (it opens a chat with “SELL” typed in), or by
              messaging <b>+{site.whatsappNumber}</b> directly. Every chat
              appears here the moment it starts.
            </p>
            <div className="mt-5 flex justify-center">
              <ButtonLink href="/admin/whatsapp/simulator" size="sm">
                <Smartphone aria-hidden /> Try it in the simulator
              </ButtonLink>
            </div>
          </EmptyState>
        ) : (
          <EmptyState icon={MessageCircle} title="Nothing here right now">
            <p>No chats match this filter.</p>
          </EmptyState>
        )
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
          {conversations.map((c) => {
            const name =
              c.seller?.name || c.profileName || formatPhone(c.phone);
            const last = c.messages[0];
            const step = toBotStep(c.step);
            const isUnread = c.unreadCount > 0;
            return (
              <li key={c.id}>
                <Link
                  href={`/admin/whatsapp/${c.id}`}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3.5 transition hover:bg-mist sm:gap-4 sm:px-5",
                    isUnread && "bg-brand-50/40",
                  )}
                >
                  <Avatar name={name} highlight={step === "HUMAN"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p
                        className={cn(
                          "truncate text-[15px] text-ink",
                          isUnread ? "font-bold" : "font-semibold",
                        )}
                      >
                        {name}
                      </p>
                      {c.seller && (
                        <Badge
                          size="sm"
                          tone="brand"
                          className="hidden font-mono sm:inline-flex"
                        >
                          {c.seller.code}
                        </Badge>
                      )}
                      {step === "HUMAN" && (
                        <Badge size="sm" tone="amber">
                          <Hand aria-hidden /> Needs a person
                        </Badge>
                      )}
                      <span
                        className={cn(
                          "ml-auto shrink-0 text-xs tabular",
                          isUnread
                            ? "font-semibold text-brand-700"
                            : "text-faint",
                        )}
                      >
                        {timeAgo(last?.createdAt ?? c.updatedAt, now)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm",
                          isUnread ? "text-ink-soft" : "text-muted",
                        )}
                      >
                        {last ? (
                          <Preview message={last} />
                        ) : (
                          <span className="italic">No messages</span>
                        )}
                      </p>
                      {isUnread && (
                        <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white tabular">
                          {c.unreadCount > 99 ? "99+" : c.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-faint">
                      <span className="tabular">{formatPhone(c.phone)}</span>
                      {step !== "IDLE" && step !== "HUMAN" && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="text-brand-700">
                            {describeStep(step)}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Preview({
  message,
}: {
  message: {
    direction: string;
    type: string;
    body: string | null;
    sentBy: string | null;
    mediaUrl: string | null;
  };
}) {
  const who =
    message.direction === "OUTBOUND"
      ? message.sentBy === "admin"
        ? "You: "
        : message.sentBy === "system"
          ? "Update: "
          : "Bot: "
      : "";
  if (message.type === "image") {
    return (
      <>
        {who}
        <ImageIcon
          className="mr-1 inline size-3.5 -translate-y-px"
          aria-hidden
        />
        {message.body || "Photo"}
      </>
    );
  }
  if (message.type === "location") {
    return (
      <>
        {who}
        <MapPin className="mr-1 inline size-3.5 -translate-y-px" aria-hidden />
        Location
      </>
    );
  }
  const text = (message.body ?? "")
    .split("\n\n▸ ")[0]
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ");
  return (
    <>
      {who}
      {text}
    </>
  );
}

function Avatar({ name, highlight }: { name: string; highlight?: boolean }) {
  const initials =
    name
      .replace(/[^\p{L}\s]/gu, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "#";
  return (
    <span
      className={cn(
        "relative grid size-11 shrink-0 place-items-center rounded-full text-sm font-bold",
        highlight
          ? "bg-amber-100 text-amber-800 ring-2 ring-amber-300"
          : "bg-gradient-to-br from-brand-100 to-brand-200 text-brand-800",
      )}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/** Whether the assistant's AI is on (provider and model only; never the key). */
function AiStatus() {
  const ai = getAiConfig();
  return ai ? (
    <Badge tone="brand" size="sm" title={`Model: ${ai.model}`}>
      AI assistant on · {ai.provider}
    </Badge>
  ) : (
    <Badge
      tone="neutral"
      size="sm"
      title="Set AI_ENABLED=true, AI_PROVIDER and AI_API_KEY in Vercel, then redeploy"
    >
      AI assistant off · fixed replies
    </Badge>
  );
}
