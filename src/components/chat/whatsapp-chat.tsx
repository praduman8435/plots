"use client";

import {
  ArrowLeft,
  BadgeCheck,
  Camera,
  CheckCheck,
  Clock,
  ImageIcon,
  Info,
  LayoutDashboard,
  LifeBuoy,
  ListIcon,
  LoaderCircle,
  LocateFixed,
  MapPin,
  MessageCircleQuestion,
  MoreVertical,
  Paperclip,
  Phone,
  Send,
  Undo2,
  Video,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import type { ChatInteractive, ChatMessage, ChatOption, ChatState } from "@/server/whatsapp/chat-state";
import { LogoMark } from "@/components/ui/logo";
import { cn } from "@/lib/cn";

/**
 * The WhatsApp-style chat with the listing assistant, shared by the admin
 * simulator (variant "admin": always in a phone frame, next to dev controls)
 * and the seller-facing web chat at /sell/chat (variant "seller": a full
 * app screen on phones, a phone frame on desktop).
 *
 *   const chat = useWhatsAppChat({ initial, send });   // state + actions
 *   <ChatWindow chat={chat} variant="seller" />         // the phone UI
 */

export type ChatVariant = "admin" | "seller";
export type PendingMessage = ChatMessage & { localPreview?: string };

// ───────────────────────────── Rich text (also used by the admin inbox) ─────────────────────────────

const INLINE = /(https?:\/\/[^\s]+)|\*([^*\n]+)\*|_([^_\n]+)_|~([^~\n]+)~/g;

/** WhatsApp-style text: *bold*, _italic_, ~strike~, clickable links, line breaks. */
export function WaRichText({ text, className }: { text: string; className?: string }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > last) nodes.push(text.slice(last, m.index));
    if (m[1]) {
      nodes.push(
        <a key={key++} href={m[1]} target="_blank" rel="noreferrer" className="break-all text-sky-700 underline underline-offset-2">
          {m[1]}
        </a>,
      );
    } else if (m[2]) nodes.push(<strong key={key++} className="font-semibold">{m[2]}</strong>);
    else if (m[3]) nodes.push(<em key={key++}>{m[3]}</em>);
    else if (m[4]) nodes.push(<s key={key++}>{m[4]}</s>);
    last = m.index! + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <span className={cn("break-words whitespace-pre-wrap", className)}>{nodes}</span>;
}

/** Splits a stored interactive body ("text\n\n▸ A\n▸ B\n\n⚠️ note") into its parts. */
function splitStored(body: string): { text: string; options: string[]; note: string | null } {
  const at = body.indexOf("\n\n▸ ");
  if (at === -1) return { text: body, options: [], note: null };
  const rest = body.slice(at + 2).split("\n");
  const options: string[] = [];
  const noteLines: string[] = [];
  for (const line of rest) {
    if (line.startsWith("▸ ") && noteLines.length === 0) options.push(line.slice(2));
    else if (line.trim()) noteLines.push(line);
  }
  return { text: body.slice(0, at), options, note: noteLines.join("\n") || null };
}

/** Message text for the inbox thread: formatted text, plus the buttons a bot message offered. */
export function WaStoredBody({ body, interactive }: { body: string; interactive: boolean }) {
  if (!interactive) return <WaRichText text={body} />;
  const { text, options, note } = splitStored(body);
  return (
    <>
      <WaRichText text={text} />
      {options.length > 0 && (
        <span className="mt-2.5 flex flex-wrap gap-1.5">
          {options.map((o, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-white px-2.5 py-1 text-xs font-semibold text-brand-700"
            >
              <Undo2 className="size-3" aria-hidden />
              {o}
            </span>
          ))}
        </span>
      )}
      {note && <span className="mt-2 block text-xs font-medium text-amber-700">{note}</span>}
    </>
  );
}

// ───────────────────────────── State + actions ─────────────────────────────

/** The seller's message shown immediately, before the server round-trip completes. */
function optimistic(partial: Partial<PendingMessage>): PendingMessage {
  return {
    id: `tmp-${Math.random().toString(36).slice(2)}`,
    direction: "INBOUND",
    type: "text",
    body: null,
    mediaUrl: null,
    sentBy: null,
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

/** Fallback when no city is live yet (centre of India). */
const DEFAULT_PIN = { name: "the city", latitude: 22.9734, longitude: 78.6569 };

type SendItem = { form: FormData; preview: PendingMessage };

export type ChatController = ReturnType<typeof useWhatsAppChat>;

/**
 * Chat state and the ways to talk to the assistant.
 * `send` posts one message (FormData: kind, text, replyId, replyTitle,
 * latitude, longitude, image) and returns the new thread — or null to stop
 * (e.g. the visitor has to verify their number again).
 * `decorate` adds caller-specific fields to every message (the admin
 * simulator's phone + profile name).
 */
export function useWhatsAppChat({
  initial,
  send,
  decorate,
  connectionError = "Couldn't send. Check your connection and try again.",
}: {
  initial: ChatState;
  send: (form: FormData) => Promise<ChatState | null>;
  decorate?: (form: FormData, state: ChatState) => void;
  connectionError?: string;
}) {
  const [state, setState] = useState<ChatState>(initial);
  const [known, setKnown] = useState<Record<string, ChatInteractive>>({});
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [error, setError] = useState<string | null>(initial.error ?? null);
  const [isPending, startTransition] = useTransition();

  /** Replaces the thread (keeps the ids of buttons we've seen in this session). */
  function apply(next: ChatState) {
    setState(next);
    setError(next.error ?? null);
    const fresh: Record<string, ChatInteractive> = {};
    for (const m of next.messages) if (m.interactive) fresh[m.id] = m.interactive;
    if (Object.keys(fresh).length) setKnown((k) => ({ ...k, ...fresh }));
  }

  /** For a different thread altogether (the simulator's "Load chat" / reset). */
  function replace(next: ChatState) {
    setKnown({});
    apply(next);
  }

  function form(kind: string): FormData {
    const fd = new FormData();
    fd.set("kind", kind);
    decorate?.(fd, state);
    return fd;
  }

  /** Sends messages in order, showing each one straight away. */
  function run(items: SendItem[]) {
    if (items.length === 0) return;
    setError(null);
    setPending((p) => [...p, ...items.map((i) => i.preview)]);
    startTransition(async () => {
      try {
        for (const item of items) {
          const next = await send(item.form);
          if (!next) {
            setPending([]);
            return;
          }
          apply(next);
          setPending((p) => p.filter((x) => x.id !== item.preview.id));
        }
      } catch {
        setError(connectionError);
        setPending([]);
      }
    });
  }

  function sendText(text: string) {
    const t = text.trim();
    if (!t) return;
    const fd = form("text");
    fd.set("text", t);
    run([{ form: fd, preview: optimistic({ body: t }) }]);
  }

  function tapOption(option: ChatOption) {
    const fd = form("interactive");
    if (option.id) fd.set("replyId", option.id);
    fd.set("replyTitle", option.title);
    run([{ form: fd, preview: optimistic({ type: "interactive", body: option.title }) }]);
  }

  function sendLocation(coords: { latitude: number; longitude: number }) {
    const fd = form("location");
    fd.set("latitude", String(coords.latitude));
    fd.set("longitude", String(coords.longitude));
    run([{ form: fd, preview: optimistic({ type: "location", body: `${coords.latitude.toFixed(6)},${coords.longitude.toFixed(6)}` }) }]);
  }

  /** A random spot within ~4 km of a city — like dropping a pin at the plot. */
  function sendPinNear(city: { latitude: number; longitude: number } = state.cities[0] ?? DEFAULT_PIN) {
    const jitter = () => (Math.random() - 0.5) * 0.07;
    sendLocation({ latitude: city.latitude + jitter(), longitude: city.longitude + jitter() });
  }

  async function sendImages(files: FileList | File[] | null) {
    if (!files) return;
    const items: SendItem[] = [];
    let skipped = 0;
    for (const file of Array.from(files).slice(0, 10)) {
      if (!file.type.startsWith("image/")) {
        skipped++;
        continue;
      }
      const blob = await downscale(file);
      const fd = form("image");
      fd.set("image", new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" }));
      items.push({ form: fd, preview: optimistic({ type: "image", localPreview: URL.createObjectURL(blob) }) });
    }
    run(items);
    if (skipped) setError("Only photos can be sent here.");
  }

  return {
    state,
    known,
    pending,
    error,
    setError,
    isPending,
    startTransition,
    apply,
    replace,
    sendText,
    tapOption,
    sendLocation,
    sendPinNear,
    sendImages,
  };
}

// ───────────────────────────── Reply suggestions ─────────────────────────────

/** Replies to the weekly "still available?" check, offered while plots wait for an answer. */
export function availabilitySuggestions(plots: ChatState["plots"]): string[] {
  if (plots.awaiting > 1) return ["YES", ...Array.from({ length: Math.min(plots.awaiting, 3) }, (_, i) => `NO ${i + 1}`)];
  if (plots.awaiting === 1) return ["YES", "NO"];
  if (plots.unavailable > 0) return ["YES"];
  return [];
}

/** Quick replies a seller would type next — the chips above the composer (photo/location chips are added by the window). */
export function sellerSuggestions(state: ChatState): string[] {
  const step = state.step;
  if (step === "IDLE") {
    return [
      ...new Set([
        ...availabilitySuggestions(state.plots),
        "SELL",
        ...(state.seller ? ["STATUS"] : []),
        ...(state.plots.live > 0 && state.plots.awaiting === 0 ? ["SOLD"] : []),
        "HELP",
      ]),
    ];
  }
  // Inside a listing the assistant's own buttons and lists are the answers.
  if (step === "HUMAN") return ["MENU"];
  return [];
}

// ───────────────────────────── Frame + header ─────────────────────────────

/**
 * Green header, beige chat background. Admin (the WhatsApp simulator): a
 * phone frame on purpose — it previews what the seller sees in WhatsApp.
 * Seller: a full-height app screen on phones; from md up a messaging panel
 * that fills its container (messages scroll inside, composer pinned at the
 * bottom of the panel) — no fake phone chrome.
 */
export function ChatFrame({
  variant,
  subtitle,
  backHref,
  headerRight,
  children,
}: {
  variant: ChatVariant;
  subtitle: string;
  backHref?: string;
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  const seller = variant === "seller";
  return (
    <div
      className={cn(
        seller ? "flex h-full w-full flex-col" : "",
      )}
    >
      <div
        className={cn(
          seller
            ? "flex min-h-0 flex-1 flex-col md:overflow-hidden md:rounded-2xl md:shadow-card md:ring-1 md:ring-line"
            : "rounded-[2.9rem] bg-gradient-to-b from-brand-950 to-[#021710] p-[11px] shadow-lift ring-1 ring-black/20",
        )}
      >
        <div
          className={cn(
            "relative flex flex-col overflow-hidden bg-[#efeae2]",
            seller
              ? "min-h-0 flex-1"
              : "h-[min(780px,calc(100dvh-7rem))] min-h-[560px] rounded-[2.3rem]",
          )}
        >
          <div className="shrink-0 bg-brand-700 text-white">
            {!seller && <StatusBar className="flex" />}
            <div className={cn("flex items-center gap-2.5 px-3 pb-2.5", seller ? "pt-2.5 md:px-4 md:py-3" : "pt-1.5")}>
              {backHref ? (
                <Link href={backHref} className="-ml-1 grid size-8 shrink-0 place-items-center rounded-full transition hover:bg-white/10" aria-label="Back">
                  <ArrowLeft className="size-5" aria-hidden />
                </Link>
              ) : (
                <ArrowLeft className="size-5 shrink-0 opacity-90" aria-hidden />
              )}
              <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-white">
                <LogoMark className="size-9" />
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="flex items-center gap-1 truncate text-[16px] font-semibold">
                  InstaPlots <BadgeCheck className="size-4 shrink-0 fill-white text-brand-600" aria-label="Verified business" />
                </p>
                <p className="truncate text-[12.5px] text-white/80" aria-live="polite">
                  {subtitle}
                </p>
              </div>
              {headerRight}
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function StatusBar({ className }: { className?: string }) {
  return (
    <div className={cn("relative h-8 items-center justify-between px-7 pt-1 text-[12px] font-semibold tabular", className)}>
      <span>9:41</span>
      <span className="absolute top-1.5 left-1/2 h-[22px] w-[92px] -translate-x-1/2 rounded-full bg-black" aria-hidden />
      <span className="flex items-center gap-1" aria-hidden>
        <span className="flex items-end gap-[2px]">
          {[4, 6, 8, 10].map((h) => (
            <span key={h} className="w-[3px] rounded-sm bg-white" style={{ height: h }} />
          ))}
        </span>
        <span className="ml-1 h-[11px] w-[22px] rounded-[3px] border border-white/80 p-[1.5px]">
          <span className="block h-full w-3/4 rounded-[1.5px] bg-white" />
        </span>
      </span>
    </div>
  );
}

/** WhatsApp's faint wallpaper pattern. */
export const CHAT_WALLPAPER = {
  backgroundImage: "radial-gradient(rgb(11 79 51 / 0.06) 1px, transparent 1px), radial-gradient(rgb(11 79 51 / 0.04) 1px, transparent 1px)",
  backgroundSize: "22px 22px, 22px 22px",
  backgroundPosition: "0 0, 11px 11px",
} as const;

// ───────────────────────────── The chat window ─────────────────────────────

export function ChatWindow({
  chat,
  variant,
  emptyState,
  notice,
  suggestions = [],
  backHref,
}: {
  chat: ChatController;
  variant: ChatVariant;
  /** Shown while the thread is empty. */
  emptyState?: ReactNode;
  /** The small yellow note at the top of the thread. */
  notice?: ReactNode;
  /** Quick-reply chips above the composer. */
  suggestions?: string[];
  backHref?: string;
}) {
  const { state, known, pending, isPending, error } = chat;
  const seller = variant === "seller";
  const [draft, setDraft] = useState("");
  const [sheet, setSheet] = useState<ChatInteractive | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const scrolledOnce = useRef(false);

  const shown: PendingMessage[] = [...state.messages, ...pending];
  const messageCount = shown.length;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: scrolledOnce.current ? "smooth" : "auto" });
    scrolledOnce.current = true;
  }, [messageCount, isPending]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    chat.sendText(draft);
    setDraft("");
  }

  function tap(option: ChatOption) {
    setSheet(null);
    chat.tapOption(option);
  }

  function pickFiles(input: HTMLInputElement | null, files: FileList | null) {
    setAttachOpen(false);
    void chat.sendImages(files ? Array.from(files) : null);
    if (input) input.value = "";
  }

  function openPhotos(which: "gallery" | "camera") {
    setAttachOpen(false);
    (which === "camera" ? cameraRef : galleryRef).current?.click();
  }

  const subtitle = isPending ? "typing…" : "Listing assistant · replies instantly";
  const headerRight = seller ? (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        className="grid size-9 place-items-center rounded-full transition hover:bg-white/10"
        aria-label="More options"
        aria-expanded={menuOpen}
      >
        <MoreVertical className="size-5" aria-hidden />
      </button>
      {menuOpen && (
        <>
          <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
          <div className="absolute top-10 right-0 z-40 w-56 animate-fade-in overflow-hidden rounded-xl bg-white py-1.5 text-[15px] text-ink shadow-lift" role="menu">
            {state.seller && (
              <Link href="/seller/dashboard" role="menuitem" className="flex items-center gap-3 px-4 py-2.5 hover:bg-mist">
                <LayoutDashboard className="size-4 text-muted" aria-hidden /> My plots
              </Link>
            )}
            <button
              type="button"
              role="menuitem"
              disabled={isPending}
              onClick={() => {
                setMenuOpen(false);
                chat.sendText("HELP");
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-mist disabled:opacity-50"
            >
              <MessageCircleQuestion className="size-4 text-muted" aria-hidden /> Help
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={isPending}
              onClick={() => {
                setMenuOpen(false);
                chat.sendText("TALK");
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-mist disabled:opacity-50"
            >
              <LifeBuoy className="size-4 text-muted" aria-hidden /> Talk to our team
            </button>
          </div>
        </>
      )}
    </div>
  ) : (
    <>
      <Video className="size-5 shrink-0 opacity-90" aria-hidden />
      <Phone className="size-[18px] shrink-0 opacity-90" aria-hidden />
      <MoreVertical className="size-5 shrink-0 opacity-90" aria-hidden />
    </>
  );

  const chips = [...new Set(suggestions)];
  const photoChip = state.step === "ASK_PHOTOS";
  const locationChip = state.step === "ASK_LOCATION";

  return (
    <ChatFrame variant={variant} subtitle={subtitle} backHref={backHref} headerRight={headerRight}>
      {/* thread */}
      <div ref={scrollRef} className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3" style={CHAT_WALLPAPER}>
        {notice && (
          <div className="mx-auto mb-3 max-w-[88%] rounded-lg bg-[#fff6c6] md:max-w-md px-3 py-2 text-center text-[12px] leading-snug text-[#54513b] shadow-sm">
            {notice}
          </div>
        )}

        {shown.length === 0 && !isPending && emptyState}

        <ol className="flex flex-col gap-1.5">
          {shown.map((m, i) => {
            const prev = shown[i - 1];
            const day = dayKey(m.createdAt);
            const newDay = !prev || dayKey(prev.createdAt) !== day;
            const grouped = !newDay && prev && prev.direction === m.direction;
            const interactive =
              m.direction === "OUTBOUND" && m.type === "interactive" ? (m.interactive ?? known[m.id] ?? fromStored(m.body)) : undefined;
            return (
              <li key={m.id} className={cn("flex flex-col animate-fade-in", m.direction === "INBOUND" ? "items-end" : "items-start", !grouped && "mt-1.5")}>
                {newDay && (
                  <span
                    className="mx-auto mb-2 rounded-lg bg-white/90 px-3 py-1 text-[12px] font-medium text-[#54656f] shadow-sm"
                    suppressHydrationWarning
                  >
                    {dayLabel(m.createdAt)}
                  </span>
                )}
                <Bubble message={m} interactive={interactive} tail={!grouped} pending={m.id.startsWith("tmp-")} showSystemLabel={!seller} />
                {interactive && interactive.options.length > 0 && (
                  <InteractiveActions interactive={interactive} disabled={isPending} onTap={tap} onOpenList={() => setSheet(interactive)} />
                )}
              </li>
            );
          })}
          {isPending && (
            <li className="mt-1.5 flex items-start" aria-label="InstaPlots is typing">
              <span className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-white px-3.5 py-3 shadow-sm">
                {[0, 150, 300].map((d) => (
                  <span key={d} className="size-1.5 animate-bounce rounded-full bg-faint" style={{ animationDelay: `${d}ms` }} />
                ))}
              </span>
            </li>
          )}
        </ol>
      </div>

      {/* composer */}
      <div className={cn("relative shrink-0 bg-[#efeae2] px-2 pt-1", seller ? "pb-safe md:pb-3" : "pb-3")}>
        {seller && error && (
          <div role="alert" className="mx-1 mb-1.5 flex animate-fade-in items-start gap-2 rounded-xl bg-white px-3 py-2 text-[13px] text-red-700 shadow-sm ring-1 ring-red-100">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">{error}</span>
            <button type="button" onClick={() => chat.setError(null)} className="-m-1 grid size-6 place-items-center rounded-full hover:bg-red-50" aria-label="Dismiss">
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        )}

        {(chips.length > 0 || photoChip || locationChip) && (
          <div className="no-scrollbar -mx-2 mb-1.5 flex gap-1.5 overflow-x-auto px-2 pb-0.5" aria-label="Quick replies">
            {photoChip && (
              <Chip onClick={() => openPhotos("gallery")} disabled={isPending} strong>
                <ImageIcon className="size-4" aria-hidden /> Add photos
              </Chip>
            )}
            {locationChip && (
              <Chip onClick={() => setLocationOpen(true)} disabled={isPending} strong>
                <MapPin className="size-4" aria-hidden /> Send location
              </Chip>
            )}
            {chips.map((s) => (
              <Chip key={s} onClick={() => chat.sendText(s)} disabled={isPending}>
                {s}
              </Chip>
            ))}
          </div>
        )}

        {attachOpen && (
          <div className="absolute right-3 bottom-[calc(100%-0.25rem)] left-3 z-10 grid animate-fade-up grid-cols-3 gap-2 rounded-2xl bg-white p-3 shadow-lift">
            <AttachButton icon={<ImageIcon className="size-5" />} label="Gallery" tone="bg-violet-500" onClick={() => openPhotos("gallery")} />
            <AttachButton icon={<Camera className="size-5" />} label="Camera" tone="bg-rose-500" onClick={() => openPhotos("camera")} />
            <AttachButton
              icon={<MapPin className="size-5" />}
              label="Location"
              tone="bg-brand-600"
              onClick={() => {
                setAttachOpen(false);
                setLocationOpen(true);
              }}
            />
          </div>
        )}

        <form onSubmit={onSubmit} className="flex items-end gap-1.5">
          <div className="flex min-h-11 min-w-0 flex-1 items-center gap-0.5 rounded-3xl bg-white pr-1 pl-4 shadow-sm">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message"
              aria-label="Message"
              enterKeyHint="send"
              className="h-11 min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-faint focus:outline-none"
              autoComplete="off"
              maxLength={4000}
            />
            <button
              type="button"
              onClick={() => setAttachOpen((o) => !o)}
              className="grid size-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-mist hover:text-ink"
              aria-label="Attach"
              aria-expanded={attachOpen}
            >
              {attachOpen ? <X className="size-5" /> : <Paperclip className="size-5 -rotate-45" />}
            </button>
            {!draft && (
              <button
                type="button"
                onClick={() => openPhotos("camera")}
                className="grid size-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-mist hover:text-ink"
                aria-label="Take a photo"
              >
                <Camera className="size-5" />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={!draft.trim()}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-600 text-white shadow-brand transition hover:bg-brand-700 active:scale-95 disabled:opacity-60"
            aria-label="Send"
          >
            {isPending ? <LoaderCircle className="size-5 animate-spin" /> : <Send className="size-5 translate-x-px" />}
          </button>
        </form>
        <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={(e) => pickFiles(e.currentTarget, e.target.files)} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pickFiles(e.currentTarget, e.target.files)} />
      </div>

      {/* list picker */}
      {sheet && (
        <Sheet title={sheet.buttonLabel ?? "Choose"} onClose={() => setSheet(null)}>
          <ul className="max-h-[55vh] overflow-y-auto border-t border-line">
            {sheet.options.map((o) => (
              <li key={o.id ?? o.title}>
                <button
                  type="button"
                  onClick={() => tap(o)}
                  className="flex w-full items-center gap-3 border-b border-line px-5 py-3 text-left transition hover:bg-brand-50/60 active:bg-brand-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-ink">{o.title}</span>
                    {o.description && <span className="block truncate text-[13px] text-muted">{o.description}</span>}
                  </span>
                  <span className="size-5 shrink-0 rounded-full border-2 border-line-strong" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      {/* location picker */}
      {locationOpen && (
        <LocationSheet
          cities={state.cities}
          onClose={() => setLocationOpen(false)}
          onSend={(coords) => {
            setLocationOpen(false);
            chat.sendLocation(coords);
          }}
          onPin={(city) => {
            setLocationOpen(false);
            chat.sendPinNear(city);
          }}
        />
      )}
    </ChatFrame>
  );
}

function Chip({ children, onClick, disabled, strong }: { children: ReactNode; onClick: () => void; disabled?: boolean; strong?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold whitespace-nowrap shadow-sm transition active:scale-95 disabled:opacity-50",
        strong ? "bg-brand-600 text-white hover:bg-brand-700" : "bg-white text-brand-800 hover:bg-brand-50",
      )}
    >
      {children}
    </button>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end bg-black/35 animate-fade-in" onClick={onClose}>
      <div className="animate-sheet-up rounded-t-3xl bg-white pb-safe shadow-lift" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line-strong" />
        <div className="flex items-center gap-2 px-4 pt-2 pb-3">
          <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-full hover:bg-mist" aria-label="Close">
            <X className="size-5 text-muted" />
          </button>
          <p className="flex-1 text-center text-[15px] font-semibold text-ink">{title}</p>
          <span className="size-8" />
        </div>
        {children}
      </div>
    </div>
  );
}

function LocationSheet({
  cities,
  onClose,
  onSend,
  onPin,
}: {
  cities: ChatState["cities"];
  onClose: () => void;
  onSend: (coords: { latitude: number; longitude: number }) => void;
  onPin: (city: { latitude: number; longitude: number }) => void;
}) {
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  function current() {
    if (!navigator.geolocation) {
      setGeoError("Location isn't available on this device. Drop a pin in your city instead.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onSend({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
      () => {
        setLocating(false);
        setGeoError("Couldn't get your location. Allow location access, or drop a pin in your city instead.");
      },
      { timeout: 10000, enableHighAccuracy: true, maximumAge: 60000 },
    );
  }

  const pins = cities.length ? cities : [DEFAULT_PIN];
  return (
    <Sheet title="Send location" onClose={onClose}>
      <div className="max-h-[60vh] overflow-y-auto border-t border-line">
        <button
          type="button"
          onClick={current}
          disabled={locating}
          className="flex w-full items-center gap-3 border-b border-line px-5 py-3.5 text-left transition hover:bg-brand-50/60 disabled:opacity-70"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
            {locating ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <LocateFixed className="size-5" aria-hidden />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-ink">Send your current location</span>
            <span className="block text-[13px] text-muted">Best when you&apos;re standing at the plot</span>
          </span>
        </button>
        {geoError && <p className="border-b border-line bg-amber-50 px-5 py-2.5 text-[13px] text-amber-800">{geoError}</p>}
        <p className="px-5 pt-3 pb-1 text-[12px] font-semibold tracking-wide text-muted uppercase">Or drop a pin</p>
        {pins.map((c) => (
          <button
            key={c.name}
            type="button"
            onClick={() => onPin(c)}
            className="flex w-full items-center gap-3 border-b border-line px-5 py-3 text-left transition hover:bg-brand-50/60"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-red-50 text-red-600">
              <MapPin className="size-5" aria-hidden />
            </span>
            <span className="text-[15px] text-ink">Near {c.name}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function AttachButton({ icon, label, tone, onClick }: { icon: ReactNode; label: string; tone: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1.5 rounded-xl p-2 text-center transition hover:bg-mist">
      <span className={cn("grid size-12 place-items-center rounded-full text-white shadow-sm", tone)}>{icon}</span>
      <span className="text-[12px] leading-tight font-medium text-ink-soft">{label}</span>
    </button>
  );
}

// ───────────────────────────── Bubbles ─────────────────────────────

const TZ = "Asia/Kolkata";

function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}

function dayLabel(iso: string) {
  const key = dayKey(iso);
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-IN", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" });
}

function Bubble({
  message: m,
  interactive,
  tail,
  pending,
  showSystemLabel,
}: {
  message: PendingMessage;
  interactive?: ChatInteractive;
  tail: boolean;
  pending: boolean;
  showSystemLabel: boolean;
}) {
  const mine = m.direction === "INBOUND"; // the seller's own message, as seen on their phone
  const time = new Date(m.createdAt).toLocaleTimeString("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
  const image = m.localPreview ?? m.mediaUrl;
  const location = m.type === "location" && m.body ? parseLatLng(m.body) : null;
  const text = interactive ? interactive.body : location ? null : m.body;
  const hasOptions = Boolean(interactive?.options.length);

  return (
    <div
      className={cn(
        "relative max-w-[86%] md:max-w-[34rem] px-2 pt-1.5 pb-1 text-[15px] leading-snug text-[#111b21] shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]",
        mine ? "bg-[#d9fdd3]" : "bg-white",
        "rounded-xl",
        tail && (mine ? "rounded-tr-none" : "rounded-tl-none"),
        hasOptions && "rounded-b-none",
      )}
    >
      {showSystemLabel && !mine && m.sentBy === "system" && (
        <span className="mb-0.5 block px-1 text-[11px] font-semibold text-brand-700">InstaPlots · notification</span>
      )}
      {image && (
        // eslint-disable-next-line @next/next/no-img-element -- user photos of unknown size from /media
        <img src={image} alt="Photo" className="mb-1 max-h-72 w-64 max-w-full rounded-lg object-cover" />
      )}
      {location && (
        <a href={osmLink(location.latitude, location.longitude)} target="_blank" rel="noreferrer" className="mb-1 block w-60 max-w-full overflow-hidden rounded-lg">
          <span className="relative block h-28 bg-[linear-gradient(135deg,#d7eadf,#eef6f1)]">
            <span className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgb(11_79_51/0.08)_1px,transparent_1px),linear-gradient(90deg,rgb(11_79_51/0.08)_1px,transparent_1px)] [background-size:18px_18px]" />
            <MapPin className="absolute top-1/2 left-1/2 size-8 -translate-x-1/2 -translate-y-full fill-red-500 text-red-700" aria-hidden />
          </span>
          <span className="block px-1 pt-1.5 text-[13px] font-medium text-sky-700">
            📍 {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
          </span>
        </a>
      )}
      {text && (
        <span className="block px-1">
          <WaRichText text={text} />
        </span>
      )}
      <span className="float-right ml-3 flex translate-y-0.5 items-center gap-0.5 pl-1 text-[11px] text-[#667781]" suppressHydrationWarning>
        {time}
        {mine && (pending ? <Clock className="size-3" aria-label="Sending" /> : <CheckCheck className="size-3.5 text-sky-500" aria-label="Read" />)}
      </span>
      <span className="clear-both block" />
    </div>
  );
}

function InteractiveActions({
  interactive,
  disabled,
  onTap,
  onOpenList,
}: {
  interactive: ChatInteractive;
  disabled: boolean;
  onTap: (o: ChatOption) => void;
  onOpenList: () => void;
}) {
  const base =
    "flex w-full items-center justify-center gap-1.5 bg-white px-3 py-2.5 text-[15px] font-medium text-[#027eb5] transition hover:bg-[#f5f6f6] active:bg-[#eceeee] disabled:opacity-60";
  if (interactive.kind === "list") {
    return (
      <div className="w-full max-w-[86%] overflow-hidden rounded-b-xl md:max-w-[34rem] border-t border-[#e9edef] shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]">
        <button type="button" className={base} disabled={disabled} onClick={onOpenList}>
          <ListIcon className="size-4" aria-hidden />
          {interactive.buttonLabel ?? "Choose"}
        </button>
      </div>
    );
  }
  return (
    <div className="flex w-full max-w-[86%] flex-col gap-px md:max-w-[34rem] overflow-hidden rounded-b-xl bg-[#e9edef] pt-px shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]">
      {interactive.options.map((o) => (
        <button key={o.id ?? o.title} type="button" className={base} disabled={disabled} onClick={() => onTap(o)}>
          <Undo2 className="size-4" aria-hidden />
          {o.title}
        </button>
      ))}
    </div>
  );
}

/** Stateless button ids we can recover from their titles (the weekly availability check and its follow-up). */
const KNOWN_BUTTON_IDS: Record<string, string> = {
  "YES, available": "avail:yes",
  "YES, all available": "avail:yes",
  "NO, it's sold": "avail:no",
  "One is sold": "avail:no",
  "Another is sold": "avail:no",
  "NO, it's sold too": "avail:no",
};

/** Rebuilds tappable options from a stored body when the ids aren't known (e.g. after a reload). */
function fromStored(body: string | null): ChatInteractive | undefined {
  if (!body) return undefined;
  const { text, options } = splitStored(body);
  if (options.length === 0) return undefined;
  return {
    kind: options.length > 3 ? "list" : "buttons",
    body: text,
    buttonLabel: options.length > 3 ? "Choose" : undefined,
    options: options.map((title) => ({ id: KNOWN_BUTTON_IDS[title], title })),
  };
}

function parseLatLng(body: string): { latitude: number; longitude: number } | null {
  const m = body.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
  return m ? { latitude: Number(m[1]), longitude: Number(m[2]) } : null;
}

function osmLink(lat: number, lng: number) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
}

/** Resizes a photo in the browser so uploads stay well under the server-action body limit. */
async function downscale(file: File, max = 1400): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.8));
  } catch {
    return file;
  }
}
