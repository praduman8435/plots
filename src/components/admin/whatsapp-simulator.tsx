"use client";

import {
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  Camera,
  CheckCheck,
  Clock,
  ExternalLink,
  ImageIcon,
  ListIcon,
  LoaderCircle,
  MapPin,
  MoreVertical,
  Paperclip,
  Phone,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  TimerOff,
  Undo2,
  Video,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import {
  simulatorAvailabilityCheck,
  simulatorLoad,
  simulatorNoReply,
  simulatorReset,
  simulatorSend,
  type SimInteractive,
  type SimMessage,
  type SimOption,
  type SimState,
} from "@/server/actions/admin/whatsapp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { LogoMark } from "@/components/ui/logo";
import { cn } from "@/lib/cn";

// ───────────────────────────── Shared rendering (also used by the inbox thread) ─────────────────────────────

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

// ───────────────────────────── Simulator ─────────────────────────────

type Pending = SimMessage & { localPreview?: string };

const QUICK_COMMANDS = ["SELL", "Hi", "STATUS", "ID", "YES", "NO", "NO 2", "SOLD", "TALK", "MENU", "HELP", "CANCEL"];

/** Typical answers per step, so a demo flows without typing. */
const SUGGESTIONS: Record<string, string[]> = {
  IDLE: ["SELL", "Hi", "STATUS"],
  ASK_NAME: ["Ramesh Yadav", "my name is suresh"],
  ASK_SELLER_TYPE: ["owner", "property dealer"],
  ASK_LAND_TYPE: ["khet", "house plot"],
  ASK_LOCALITY: ["Rampur, near Panchayat Bhawan", "Sector 70, opp. the market"],
  ASK_AREA: ["10 marla", "1 kanal 5 marla", "2 bigha", "1200 sq ft", "15"],
  ASK_AREA_UNIT: ["marla", "bigha", "gaj"],
  ASK_PRICE: ["18 lakh", "1.2 crore", "18,00,000", "18"],
  ASK_PHOTOS: ["Done", "Skip"],
  ASK_LOCATION: ["Skip"],
  ASK_DESCRIPTION: ["Road facing, bijli and tubewell available, 2 km from the highway. Papers clear.", "Skip"],
  CONFIRM: ["Submit", "Start over"],
  HUMAN: ["MENU", "Hello? anyone there"],
  ASK_SOLD_WHICH: ["1", "2", "YES"],
};

/** Replies to the weekly availability check, offered while plots are waiting for an answer. */
function availabilitySuggestions(plots: SimState["plots"]): string[] {
  if (plots.awaiting > 1) return ["YES", "NO 2", "bik gaya"];
  if (plots.awaiting === 1) return ["YES", "NO", "haan"];
  if (plots.unavailable > 0) return ["YES"];
  return [];
}

/** Fallback when no city is live yet (centre of India). */
const DEFAULT_PIN = { name: "the city", latitude: 22.9734, longitude: 78.6569 };

/** The seller's message shown immediately, before the server round-trip completes. */
function optimistic(partial: Partial<Pending>): Pending {
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

export function WhatsAppSimulator({ initial, defaultProfileName }: { initial: SimState; defaultProfileName: string }) {
  const [state, setState] = useState<SimState>(initial);
  const [known, setKnown] = useState<Record<string, SimInteractive>>({});
  const [pending, setPending] = useState<Pending[]>([]);
  const [phoneInput, setPhoneInput] = useState(initial.phone);
  const [profileName, setProfileName] = useState(initial.profileName ?? defaultProfileName);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(initial.error ?? null);
  const [sheet, setSheet] = useState<{ messageId: string; interactive: SimInteractive } | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pinCity = state.cities[0] ?? DEFAULT_PIN;
  const messageCount = state.messages.length + pending.length;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messageCount, isPending]);

  function apply(next: SimState) {
    setState(next);
    setError(next.error ?? null);
    const fresh: Record<string, SimInteractive> = {};
    for (const m of next.messages) if (m.interactive) fresh[m.id] = m.interactive;
    if (Object.keys(fresh).length) setKnown((k) => ({ ...k, ...fresh }));
  }

  function baseForm(kind: string): FormData {
    const fd = new FormData();
    fd.set("phone", state.phone);
    fd.set("profileName", profileName);
    fd.set("kind", kind);
    return fd;
  }

  /** Sends one or more simulated inbound messages in order. */
  function run(items: { form: FormData; preview: Pending }[]) {
    if (items.length === 0) return;
    setPending((p) => [...p, ...items.map((i) => i.preview)]);
    startTransition(async () => {
      try {
        for (const item of items) {
          const next = await simulatorSend(item.form);
          apply(next);
          setPending((p) => p.filter((x) => x.id !== item.preview.id));
        }
      } catch {
        setError("Couldn't reach the assistant. Is the dev server running?");
        setPending([]);
      }
    });
  }

  function sendText(text: string) {
    const t = text.trim();
    if (!t) return;
    const fd = baseForm("text");
    fd.set("text", t);
    run([{ form: fd, preview: optimistic({ body: t }) }]);
  }

  function tapOption(option: SimOption) {
    setSheet(null);
    const fd = baseForm("interactive");
    if (option.id) fd.set("replyId", option.id);
    fd.set("replyTitle", option.title);
    run([{ form: fd, preview: optimistic({ type: "interactive", body: option.title }) }]);
  }

  function sendLocation(coords: { latitude: number; longitude: number }) {
    setAttachOpen(false);
    const fd = baseForm("location");
    fd.set("latitude", String(coords.latitude));
    fd.set("longitude", String(coords.longitude));
    run([
      {
        form: fd,
        preview: optimistic({ type: "location", body: `${coords.latitude.toFixed(6)},${coords.longitude.toFixed(6)}` }),
      },
    ]);
  }

  function sendNearbyPin() {
    // A random spot within ~4 km of the first live city — like dropping a pin at the plot.
    const jitter = () => (Math.random() - 0.5) * 0.07;
    sendLocation({ latitude: pinCity.latitude + jitter(), longitude: pinCity.longitude + jitter() });
  }

  function sendMyLocation() {
    if (!navigator.geolocation) return sendNearbyPin();
    navigator.geolocation.getCurrentPosition(
      (pos) => sendLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => sendNearbyPin(),
      { timeout: 6000 },
    );
  }

  async function onFiles(files: FileList | null) {
    setAttachOpen(false);
    if (!files?.length) return;
    const items: { form: FormData; preview: Pending }[] = [];
    for (const file of Array.from(files).slice(0, 10)) {
      if (!file.type.startsWith("image/")) continue;
      const blob = await downscale(file);
      const fd = baseForm("image");
      fd.set("image", new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" }));
      items.push({ form: fd, preview: optimistic({ type: "image", localPreview: URL.createObjectURL(blob) }) });
    }
    if (fileRef.current) fileRef.current.value = "";
    run(items);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    sendText(draft);
    setDraft("");
  }

  function loadNumber(e: FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const next = await simulatorLoad(phoneInput);
      setKnown({});
      apply(next);
      if (!next.error) setPhoneInput(next.phone);
    });
  }

  /** Dev controls: play the weekly availability job for this number. */
  function availabilityCheck() {
    startTransition(async () => {
      try {
        apply(await simulatorAvailabilityCheck(state.phone));
      } catch {
        setError("Couldn't run the availability check. Is the dev server running?");
      }
    });
  }

  function noReply() {
    startTransition(async () => {
      try {
        apply(await simulatorNoReply(state.phone));
      } catch {
        setError("Couldn't simulate the 24 hours. Is the dev server running?");
      }
    });
  }

  function reset() {
    if (!window.confirm("Delete this simulated chat and start fresh? (Sellers and plots it created are kept.)")) return;
    startTransition(async () => {
      const next = await simulatorReset(state.phone);
      setKnown({});
      apply(next);
    });
  }

  const shown: Pending[] = [...state.messages, ...pending];
  const suggestions = [
    ...new Set([
      ...(state.step === "IDLE" ? availabilitySuggestions(state.plots) : []),
      ...(state.step === "ASK_CITY" ? state.cities.map((c) => c.name) : []),
      ...(SUGGESTIONS[state.step] ?? []),
    ]),
  ];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,410px)] xl:gap-10">
      {/* ── Controls ── */}
      <div className="order-2 flex min-w-0 flex-col gap-4 lg:order-1">
        <section className="rounded-3xl border border-line bg-white p-5 shadow-soft">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700">
              <ShieldCheck className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="font-bold text-ink">Test seller</h2>
              <p className="text-sm text-muted">
                You are chatting as this WhatsApp user. The assistant&apos;s replies are only recorded — nothing is sent to WhatsApp.
              </p>
            </div>
          </div>
          <form onSubmit={loadNumber} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sim-phone">Mobile number</Label>
              <Input id="sim-phone" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} inputMode="tel" autoComplete="off" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sim-name">WhatsApp profile name</Label>
              <Input id="sim-name" value={profileName} onChange={(e) => setProfileName(e.target.value)} autoComplete="off" />
            </div>
            <Button type="submit" variant="secondary" disabled={isPending}>
              Load chat
            </Button>
          </form>
          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 ring-1 ring-red-100">
              {error}
            </p>
          )}
        </section>

        <section className="rounded-3xl border border-line bg-white p-5 shadow-soft">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={state.step === "HUMAN" ? "amber" : state.step === "IDLE" ? "neutral" : "brand"}>
              {state.step === "HUMAN" ? "🙋 " : ""}
              {state.stepLabel}
            </Badge>
            {state.seller ? (
              <Badge tone="solid">
                <BadgeCheck aria-hidden />
                {state.seller.code}
              </Badge>
            ) : (
              <Badge tone="neutral">No Seller ID yet</Badge>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              {state.conversationId && (
                <Link
                  href={`/admin/whatsapp/${state.conversationId}`}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
                >
                  Open in inbox <ExternalLink className="size-3.5" aria-hidden />
                </Link>
              )}
              {state.seller && (
                <Link
                  href={`/admin/sellers/${state.seller.id}`}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
                >
                  Seller <ExternalLink className="size-3.5" aria-hidden />
                </Link>
              )}
            </div>
          </div>

          {suggestions.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                <Sparkles className="size-3.5 text-brand-600" aria-hidden /> Try answering
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={isPending}
                    onClick={() => sendText(s)}
                    className="max-w-full truncate rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1.5 text-sm font-medium text-brand-800 transition hover:border-brand-300 hover:bg-brand-100 disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
                {state.step === "ASK_PHOTOS" && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 disabled:opacity-50"
                  >
                    <Camera className="size-4" aria-hidden /> Attach photos
                  </button>
                )}
                {state.step === "ASK_LOCATION" && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={sendNearbyPin}
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 disabled:opacity-50"
                  >
                    <MapPin className="size-4" aria-hidden /> Drop a pin
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Commands</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_COMMANDS.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={isPending}
                  onClick={() => sendText(c)}
                  className="rounded-lg border border-line bg-mist px-2.5 py-1 font-mono text-xs font-semibold text-ink-soft transition hover:border-line-strong hover:bg-white disabled:opacity-50"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold tracking-wide text-amber-800 uppercase">Weekly availability check · dev</p>
              {state.seller && (
                <span className="text-xs text-amber-900/80">
                  {state.plots.live} live · {state.plots.awaiting} awaiting reply · {state.plots.unavailable} unavailable
                  {state.plots.pending ? ` · ${state.plots.pending} pending approval` : ""}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-amber-900/80">
              {state.seller
                ? "Plays the weekly job for this number only. Changes the seller's plots for real; nothing is sent to WhatsApp."
                : "Available once this number has a Seller ID and a live (approved) plot."}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={availabilityCheck}
                disabled={isPending || !state.seller || state.plots.live === 0}
                title="Asks “Is your property still available?” about this seller's live plots and starts the 24h timer"
              >
                <CalendarClock aria-hidden /> Send weekly availability check
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={noReply}
                disabled={isPending || state.plots.awaiting === 0}
                title="Hides the plots still waiting for a reply, as if 24 hours passed in silence"
              >
                <TimerOff aria-hidden /> Simulate 24h with no reply
              </Button>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-xs text-muted">Listings submitted here are real PENDING plots — reject or delete them after a demo.</p>
            <Button type="button" variant="danger" size="sm" onClick={reset} disabled={isPending || !state.conversationId}>
              <RotateCcw aria-hidden /> Reset chat
            </Button>
          </div>
        </section>
      </div>

      {/* ── Phone ── */}
      <div className="order-1 mx-auto w-full max-w-[410px] lg:sticky lg:top-6 lg:order-2">
        <div className="rounded-[2.9rem] bg-gradient-to-b from-brand-950 to-[#021710] p-[11px] shadow-lift ring-1 ring-black/20">
          <div className="relative flex h-[min(780px,calc(100dvh-7rem))] min-h-[560px] flex-col overflow-hidden rounded-[2.3rem] bg-[#ece7df]">
            {/* status bar + header */}
            <div className="bg-brand-700 text-white">
              <div className="relative flex h-8 items-center justify-between px-7 pt-1 text-[12px] font-semibold tabular">
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
              <div className="flex items-center gap-2.5 px-3 pt-1.5 pb-2.5">
                <ArrowLeft className="size-5 shrink-0 opacity-90" aria-hidden />
                <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-white">
                  <LogoMark className="size-9" />
                </span>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="flex items-center gap-1 truncate text-[15px] font-semibold">
                    Plots <BadgeCheck className="size-4 fill-white text-brand-600" aria-label="Verified business" />
                  </p>
                  <p className="truncate text-[12px] text-white/75">{isPending ? "typing…" : "Listing assistant · usually replies instantly"}</p>
                </div>
                <Video className="size-5 shrink-0 opacity-90" aria-hidden />
                <Phone className="size-[18px] shrink-0 opacity-90" aria-hidden />
                <MoreVertical className="size-5 shrink-0 opacity-90" aria-hidden />
              </div>
            </div>

            {/* chat */}
            <div
              ref={scrollRef}
              className="no-scrollbar flex-1 overflow-y-auto px-3 py-3"
              style={{
                backgroundImage:
                  "radial-gradient(rgb(11 79 51 / 0.06) 1px, transparent 1px), radial-gradient(rgb(11 79 51 / 0.04) 1px, transparent 1px)",
                backgroundSize: "22px 22px, 22px 22px",
                backgroundPosition: "0 0, 11px 11px",
              }}
            >
              <div className="mx-auto mb-3 max-w-[85%] rounded-lg bg-[#fff6c6] px-3 py-2 text-center text-[11.5px] leading-snug text-[#54513b] shadow-sm">
                <Clock className="mr-1 inline size-3 -translate-y-px" aria-hidden />
                Simulator — messages stay on this server and are never sent to WhatsApp.
              </div>

              {shown.length === 0 && !isPending && (
                <div className="mt-10 flex flex-col items-center gap-3 px-6 text-center">
                  <span className="grid size-14 place-items-center rounded-2xl bg-white shadow-card">
                    <LogoMark className="size-10" />
                  </span>
                  <p className="text-sm font-semibold text-ink">Start like a seller would</p>
                  <p className="text-[13px] text-muted">
                    Sellers tap “Sell on WhatsApp” on the website, which opens this chat with <b>SELL</b> already typed.
                  </p>
                  <Button size="sm" onClick={() => sendText("SELL — Hi, I want to list my land on Plots.")}>
                    Send “SELL”
                  </Button>
                </div>
              )}

              <ol className="flex flex-col gap-1.5">
                {shown.map((m, i) => {
                  const prev = shown[i - 1];
                  const grouped = prev && prev.direction === m.direction;
                  const interactive =
                    m.direction === "OUTBOUND" && m.type === "interactive" ? (m.interactive ?? known[m.id] ?? fromStored(m.body)) : undefined;
                  return (
                    <li key={m.id} className={cn("flex flex-col animate-fade-in", m.direction === "INBOUND" ? "items-end" : "items-start", !grouped && "mt-1.5")}>
                      <PhoneBubble message={m} interactive={interactive} tail={!grouped} pending={m.id.startsWith("tmp-")} />
                      {interactive && interactive.options.length > 0 && (
                        <InteractiveActions
                          interactive={interactive}
                          disabled={isPending}
                          onTap={tapOption}
                          onOpenList={() => setSheet({ messageId: m.id, interactive })}
                        />
                      )}
                    </li>
                  );
                })}
                {isPending && (
                  <li className="mt-1.5 flex items-start" aria-label="Assistant is typing">
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
            <div className="relative bg-[#ece7df] px-2 pt-1.5 pb-3">
              {attachOpen && (
                <div className="absolute right-3 bottom-[4.25rem] left-3 z-10 grid animate-fade-up grid-cols-3 gap-2 rounded-2xl bg-white p-3 shadow-lift">
                  <AttachButton icon={<ImageIcon className="size-5" />} label="Photos" tone="bg-violet-500" onClick={() => fileRef.current?.click()} />
                  <AttachButton icon={<MapPin className="size-5" />} label={`Pin near ${pinCity.name}`} tone="bg-brand-600" onClick={sendNearbyPin} />
                  <AttachButton icon={<MapPin className="size-5" />} label="My location" tone="bg-sky-500" onClick={sendMyLocation} />
                </div>
              )}
              <form onSubmit={onSubmit} className="flex items-end gap-1.5">
                <div className="flex min-h-11 flex-1 items-center gap-1 rounded-3xl bg-white pr-1.5 pl-4 shadow-sm">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Message"
                    aria-label="Message"
                    className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-faint focus:outline-none"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setAttachOpen((o) => !o)}
                    className="grid size-9 place-items-center rounded-full text-muted transition hover:bg-mist hover:text-ink"
                    aria-label="Attach"
                    aria-expanded={attachOpen}
                  >
                    {attachOpen ? <X className="size-5" /> : <Paperclip className="size-5 -rotate-45" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="grid size-9 place-items-center rounded-full text-muted transition hover:bg-mist hover:text-ink"
                    aria-label="Send a photo"
                  >
                    <Camera className="size-5" />
                  </button>
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
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
            </div>

            {/* list picker sheet */}
            {sheet && (
              <div className="absolute inset-0 z-20 flex flex-col justify-end bg-black/35 animate-fade-in" onClick={() => setSheet(null)}>
                <div
                  className="animate-sheet-up rounded-t-3xl bg-white pb-5 shadow-lift"
                  onClick={(e) => e.stopPropagation()}
                  role="dialog"
                  aria-label={sheet.interactive.buttonLabel ?? "Options"}
                >
                  <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line-strong" />
                  <div className="flex items-center gap-2 px-4 pt-2 pb-3">
                    <button type="button" onClick={() => setSheet(null)} className="grid size-8 place-items-center rounded-full hover:bg-mist" aria-label="Close">
                      <X className="size-5 text-muted" />
                    </button>
                    <p className="flex-1 text-center text-[15px] font-semibold text-ink">{sheet.interactive.buttonLabel ?? "Choose"}</p>
                    <span className="size-8" />
                  </div>
                  <ul className="max-h-[55vh] overflow-y-auto border-t border-line">
                    {sheet.interactive.options.map((o) => (
                      <li key={o.id ?? o.title}>
                        <button
                          type="button"
                          onClick={() => tapOption(o)}
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
                </div>
              </div>
            )}
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-muted">
          Tip: buttons and lists work exactly like on a real phone. Photos are resized before upload.
        </p>
      </div>
    </div>
  );
}

function AttachButton({ icon, label, tone, onClick }: { icon: ReactNode; label: string; tone: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1.5 rounded-xl p-2 text-center transition hover:bg-mist">
      <span className={cn("grid size-11 place-items-center rounded-full text-white shadow-sm", tone)}>{icon}</span>
      <span className="text-[11.5px] leading-tight font-medium text-ink-soft">{label}</span>
    </button>
  );
}

function PhoneBubble({
  message: m,
  interactive,
  tail,
  pending,
}: {
  message: Pending;
  interactive?: SimInteractive;
  tail: boolean;
  pending: boolean;
}) {
  const mine = m.direction === "INBOUND"; // the seller's own message, as seen on their phone
  const time = new Date(m.createdAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const image = m.localPreview ?? m.mediaUrl;
  const location = m.type === "location" && m.body ? parseLatLng(m.body) : null;
  const text = interactive ? interactive.body : location ? null : m.body;
  const hasOptions = Boolean(interactive?.options.length);

  return (
    <div
      className={cn(
        "relative max-w-[86%] px-2 pt-1.5 pb-1 text-[14.5px] leading-snug text-[#111b21] shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]",
        mine ? "bg-[#d9fdd3]" : "bg-white",
        "rounded-xl",
        tail && (mine ? "rounded-tr-none" : "rounded-tl-none"),
        hasOptions && "rounded-b-none",
      )}
    >
      {!mine && m.sentBy === "system" && (
        <span className="mb-0.5 block px-1 text-[11px] font-semibold text-brand-700">Plots · notification</span>
      )}
      {image && (
        // eslint-disable-next-line @next/next/no-img-element -- user photos of unknown size from /media
        <img src={image} alt="Photo" className="mb-1 max-h-72 w-64 max-w-full rounded-lg object-cover" />
      )}
      {location && (
        <a
          href={osmLink(location.latitude, location.longitude)}
          target="_blank"
          rel="noreferrer"
          className="mb-1 block w-60 max-w-full overflow-hidden rounded-lg"
        >
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
      <span className="float-right ml-3 flex translate-y-0.5 items-center gap-0.5 pl-1 text-[11px] text-[#667781]">
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
  interactive: SimInteractive;
  disabled: boolean;
  onTap: (o: SimOption) => void;
  onOpenList: () => void;
}) {
  const base =
    "flex w-full items-center justify-center gap-1.5 bg-white px-3 py-2.5 text-[14.5px] font-medium text-[#027eb5] transition hover:bg-[#f5f6f6] active:bg-[#eceeee] disabled:opacity-60";
  if (interactive.kind === "list") {
    return (
      <div className="w-full max-w-[86%] overflow-hidden rounded-b-xl border-t border-[#e9edef] shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]">
        <button type="button" className={base} disabled={disabled} onClick={onOpenList}>
          <ListIcon className="size-4" aria-hidden />
          {interactive.buttonLabel ?? "Choose"}
        </button>
      </div>
    );
  }
  return (
    <div className="flex w-full max-w-[86%] flex-col gap-px overflow-hidden rounded-b-xl bg-[#e9edef] pt-px shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]">
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
function fromStored(body: string | null): SimInteractive | undefined {
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
