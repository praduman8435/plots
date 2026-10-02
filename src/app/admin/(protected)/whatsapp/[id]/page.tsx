import { ArrowLeft, BadgeCheck, Bot, Clock, ExternalLink, Hand, MapPin, Send, ShieldAlert, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WaStoredBody } from "@/components/admin/whatsapp-simulator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin/require";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { formatPhone } from "@/lib/phone";
import { sendAdminReply, setConversationMode } from "@/server/actions/admin/whatsapp";
import { describeStep, toBotStep } from "@/server/whatsapp/bot";
import { isWhatsAppConfigured } from "@/server/whatsapp/config";
import { SERVICE_WINDOW_MS, isServiceWindowOpen } from "@/server/whatsapp/messaging";

export const dynamic = "force-dynamic";

const TZ = "Asia/Kolkata";

export async function generateMetadata({ params }: PageProps<"/admin/whatsapp/[id]">): Promise<Metadata> {
  const { id } = await params;
  const c = await db.whatsAppConversation.findUnique({ where: { id }, select: { profileName: true, seller: { select: { name: true } } } });
  return { title: c ? `Chat · ${c.seller?.name ?? c.profileName ?? "Seller"}` : "Chat" };
}

export default async function WhatsAppThreadPage({ params }: PageProps<"/admin/whatsapp/[id]">) {
  await requireAdmin();
  const { id } = await params;

  const conversation = await db.whatsAppConversation.findUnique({
    where: { id },
    include: { seller: { select: { id: true, code: true, name: true, sellerType: true, phoneVerifiedAt: true } } },
  });
  if (!conversation) notFound();

  // Opening the thread marks it as read.
  if (conversation.unreadCount > 0) {
    await db.whatsAppConversation.update({ where: { id }, data: { unreadCount: 0, updatedAt: conversation.updatedAt } });
  }

  const messages = (
    await db.whatsAppMessage.findMany({ where: { conversationId: id }, orderBy: { createdAt: "desc" }, take: 300 })
  ).reverse();

  const step = toBotStep(conversation.step);
  const name = conversation.seller?.name || conversation.profileName || formatPhone(conversation.phone);
  const windowOpen = isServiceWindowOpen(conversation.lastInboundAt);
  const closesInMs = windowRemainingMs(conversation.lastInboundAt);
  const live = isWhatsAppConfigured();

  return (
    <div className="flex flex-col">
      <Link
        href="/admin/whatsapp"
        className="mb-3 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted transition hover:text-brand-700"
      >
        <ArrowLeft className="size-4" aria-hidden /> All chats
      </Link>

      <div className="flex h-[calc(100dvh-var(--sticky-bottom,0px)-9.5rem)] min-h-[520px] flex-col overflow-hidden rounded-3xl border border-line bg-white shadow-card lg:h-[calc(100dvh-7.5rem)]">
        {/* ── Header ── */}
        <header className="flex flex-col gap-3 border-b border-line px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-sm font-bold text-brand-800">
              {initials(name)}
            </span>
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 truncate text-[17px] font-bold tracking-tight text-ink">
                {name}
                {conversation.seller?.phoneVerifiedAt && <BadgeCheck className="size-4 shrink-0 text-brand-600" aria-label="Phone verified" />}
              </h1>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                <span className="tabular">{formatPhone(conversation.phone)}</span>
                {conversation.profileName && conversation.seller && conversation.profileName !== conversation.seller.name && (
                  <span className="truncate">· “{conversation.profileName}” on WhatsApp</span>
                )}
                {conversation.seller ? (
                  <Link
                    href={`/admin/sellers/${conversation.seller.id}`}
                    className="inline-flex items-center gap-1 font-mono text-[13px] font-semibold text-brand-700 hover:underline"
                  >
                    {conversation.seller.code}
                    <ExternalLink className="size-3" aria-hidden />
                  </Link>
                ) : (
                  <Badge size="sm" tone="neutral">
                    Not a seller yet
                  </Badge>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={step === "HUMAN" ? "amber" : step === "IDLE" ? "neutral" : "brand"}>
              {step === "HUMAN" ? <Hand aria-hidden /> : <Bot aria-hidden />}
              {step === "HUMAN" ? "You're handling this chat" : `Assistant · ${describeStep(step)}`}
            </Badge>
            <form action={setConversationMode}>
              <input type="hidden" name="conversationId" value={conversation.id} />
              <input type="hidden" name="mode" value={step === "HUMAN" ? "IDLE" : "HUMAN"} />
              <Button type="submit" size="sm" variant={step === "HUMAN" ? "secondary" : "dark"}>
                {step === "HUMAN" ? (
                  <>
                    <Bot aria-hidden /> Hand back to bot
                  </>
                ) : (
                  <>
                    <UserRound aria-hidden /> Take over
                  </>
                )}
              </Button>
            </form>
          </div>
        </header>

        {/* ── Window status ── */}
        <div
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-[13px] font-medium sm:px-5",
            windowOpen ? "bg-brand-50/70 text-brand-800" : "bg-amber-50 text-amber-800",
          )}
        >
          {windowOpen ? <Clock className="size-4 shrink-0" aria-hidden /> : <ShieldAlert className="size-4 shrink-0" aria-hidden />}
          <span className="min-w-0">
            {windowOpen
              ? `Reply window open · closes in ${formatDuration(closesInMs)}`
              : "Reply window closed — the seller must message first (WhatsApp's 24-hour rule)"}
            {!live && <span className="ml-1.5 font-normal text-muted">· Dev mode: messages go to the server log, not WhatsApp</span>}
          </span>
        </div>

        {/* ── Thread (column-reverse keeps it scrolled to the newest message) ── */}
        <div
          className="flex flex-1 flex-col-reverse overflow-y-auto bg-mist px-3 py-4 sm:px-6"
          style={{ backgroundImage: "radial-gradient(rgb(11 79 51 / 0.05) 1px, transparent 1px)", backgroundSize: "20px 20px" }}
        >
          <ol className="flex flex-col gap-2">
            {messages.length === 0 && <li className="py-10 text-center text-sm text-muted">No messages yet.</li>}
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const day = dayKey(m.createdAt);
              const showDay = !prev || dayKey(prev.createdAt) !== day;
              const inbound = m.direction === "INBOUND";
              const loc = m.type === "location" && m.body ? parseLatLng(m.body) : null;
              return (
                <li key={m.id} className="flex flex-col">
                  {showDay && (
                    <span className="mx-auto my-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-muted shadow-soft ring-1 ring-line">
                      {dayLabel(m.createdAt)}
                    </span>
                  )}
                  <div className={cn("flex", inbound ? "justify-start" : "justify-end")}>
                    <div
                      className={cn(
                        "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[14.5px] leading-relaxed text-ink shadow-soft sm:max-w-[70%]",
                        inbound ? "rounded-tl-md bg-white ring-1 ring-line" : "rounded-tr-md bg-brand-50 ring-1 ring-brand-100",
                      )}
                    >
                      {!inbound && <SenderLabel sentBy={m.sentBy} />}
                      {m.mediaUrl && (
                        <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="mb-1.5 block">
                          {/* eslint-disable-next-line @next/next/no-img-element -- seller photos of unknown size from /media */}
                          <img src={m.mediaUrl} alt="Photo from seller" className="max-h-80 w-72 max-w-full rounded-xl object-cover" loading="lazy" />
                        </a>
                      )}
                      {loc ? (
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}#map=17/${loc.lat}/${loc.lng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 font-semibold text-brand-800 ring-1 ring-brand-100 hover:bg-brand-100"
                        >
                          <MapPin className="size-4 text-red-600" aria-hidden />
                          Location pin · {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                          <ExternalLink className="size-3.5" aria-hidden />
                        </a>
                      ) : (
                        m.body && <WaStoredBody body={m.body} interactive={!inbound && m.type === "interactive"} />
                      )}
                      <span className="mt-1 block text-right text-[11px] text-faint tabular">{timeLabel(m.createdAt)}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* ── Composer ── */}
        <form action={sendAdminReply} className="border-t border-line bg-white p-3 sm:p-4">
          <input type="hidden" name="conversationId" value={conversation.id} />
          <div className="flex items-end gap-2">
            <label htmlFor="reply" className="sr-only">
              Reply
            </label>
            <textarea
              id="reply"
              name="text"
              required
              rows={1}
              maxLength={4000}
              placeholder={windowOpen || !live ? `Reply to ${name.split(" ")[0]}…` : "Window closed — won't be delivered"}
              className="max-h-40 min-h-12 flex-1 resize-y rounded-2xl border border-line-strong bg-white px-4 py-3 text-[15px] text-ink shadow-soft transition placeholder:text-faint focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none"
            />
            <Button type="submit" size="icon" aria-label="Send reply" className="size-12">
              <Send aria-hidden />
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">
            {step === "HUMAN"
              ? "The assistant is paused for this chat. Hand back to the bot when you're done."
              : "Replying to an idle chat pauses the assistant so it doesn't interrupt you."}
          </p>
        </form>
      </div>
    </div>
  );
}

function SenderLabel({ sentBy }: { sentBy: string | null }) {
  const label = sentBy === "admin" ? "Admin" : sentBy === "system" ? "System" : "Assistant";
  const Icon = sentBy === "admin" ? UserRound : Bot;
  return (
    <span
      className={cn(
        "mb-1 flex w-fit items-center gap-1 text-[11px] font-bold tracking-wide uppercase",
        sentBy === "admin" ? "text-sky-700" : sentBy === "system" ? "text-amber-700" : "text-brand-700",
      )}
    >
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}

function initials(name: string) {
  return (
    name
      .replace(/[^\p{L}\s]/gu, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "#"
  );
}

function parseLatLng(body: string): { lat: number; lng: number } | null {
  const m = body.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
}

function windowRemainingMs(lastInboundAt: Date | null): number {
  return lastInboundAt ? lastInboundAt.getTime() + SERVICE_WINDOW_MS - Date.now() : 0;
}

function formatDuration(ms: number) {
  const mins = Math.max(1, Math.round(ms / 60_000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function dayKey(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

function dayLabel(d: Date) {
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000));
  const key = dayKey(d);
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }).format(d);
}

function timeLabel(d: Date) {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: TZ }).format(d);
}
