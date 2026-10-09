"use client";

import { CalendarClock, Camera, Clock, ExternalLink, MapPin, RotateCcw, ShieldCheck, Sparkles, TimerOff, BadgeCheck } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import {
  simulatorAvailabilityCheck,
  simulatorLoad,
  simulatorNoReply,
  simulatorReset,
  simulatorSend,
  type SimState,
} from "@/server/actions/admin/whatsapp";
import { ChatWindow, useWhatsAppChat } from "@/components/chat/whatsapp-chat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { LogoMark } from "@/components/ui/logo";

// The chat UI lives in components/chat/whatsapp-chat.tsx (shared with /sell/chat).
// Re-exported for the admin inbox thread.
export { WaRichText, WaStoredBody } from "@/components/chat/whatsapp-chat";

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

export function WhatsAppSimulator({ initial, defaultProfileName }: { initial: SimState; defaultProfileName: string }) {
  const [phoneInput, setPhoneInput] = useState(initial.phone);
  const [profileName, setProfileName] = useState(initial.profileName ?? defaultProfileName);
  const photosRef = useRef<HTMLInputElement>(null);
  const chat = useWhatsAppChat({
    initial,
    send: simulatorSend,
    decorate: (fd, current) => {
      fd.set("phone", current.phone);
      fd.set("profileName", profileName);
    },
    connectionError: "Couldn't reach the assistant. Is the dev server running?",
  });
  const { state, error, isPending, startTransition, sendText } = chat;

  function loadNumber(e: FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const next = await simulatorLoad(phoneInput);
      chat.replace(next);
      if (!next.error) setPhoneInput(next.phone);
    });
  }

  /** Dev controls: play the weekly availability job for this number. */
  function availabilityCheck() {
    startTransition(async () => {
      try {
        chat.apply(await simulatorAvailabilityCheck(state.phone));
      } catch {
        chat.setError("Couldn't run the availability check. Is the dev server running?");
      }
    });
  }

  function noReply() {
    startTransition(async () => {
      try {
        chat.apply(await simulatorNoReply(state.phone));
      } catch {
        chat.setError("Couldn't simulate the 24 hours. Is the dev server running?");
      }
    });
  }

  function reset() {
    if (!window.confirm("Delete this simulated chat and start fresh? (Sellers and plots it created are kept.)")) return;
    startTransition(async () => {
      chat.replace(await simulatorReset(state.phone));
    });
  }

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
                    onClick={() => photosRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 disabled:opacity-50"
                  >
                    <Camera className="size-4" aria-hidden /> Attach photos
                  </button>
                )}
                {state.step === "ASK_LOCATION" && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => chat.sendPinNear()}
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
        <ChatWindow
          chat={chat}
          variant="admin"
          notice={
            <>
              <Clock className="mr-1 inline size-3 -translate-y-px" aria-hidden />
              Simulator — messages stay on this server and are never sent to WhatsApp.
            </>
          }
          emptyState={
            <div className="mt-10 flex flex-col items-center gap-3 px-6 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-white shadow-card">
                <LogoMark className="size-10" />
              </span>
              <p className="text-sm font-semibold text-ink">Start like a seller would</p>
              <p className="text-[13px] text-muted">
                Sellers tap “Sell on WhatsApp” on the website, which opens this chat with <b>SELL</b> already typed.
              </p>
              <Button size="sm" onClick={() => sendText("SELL — Hi, I want to list my land on InstaPlots.")}>
                Send “SELL”
              </Button>
            </div>
          }
        />
        <input
          ref={photosRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void chat.sendImages(e.target.files ? Array.from(e.target.files) : null);
            e.currentTarget.value = "";
          }}
        />
        <p className="mt-3 text-center text-xs text-muted">
          Tip: buttons and lists work exactly like on a real phone. Photos are resized before upload. The same chat is open to sellers at{" "}
          <Link href="/sell/chat" className="font-semibold text-brand-700 hover:underline">
            /sell/chat
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
