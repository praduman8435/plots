"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { chatLoad, chatSend, chatStartVerification, chatVerify } from "@/server/actions/seller/chat";
import type { ChatState } from "@/server/whatsapp/chat-state";
import { LogoMark } from "@/components/ui/logo";
import { CHAT_WALLPAPER, ChatFrame, ChatWindow, WaRichText, sellerSuggestions, useWhatsAppChat } from "./whatsapp-chat";

/**
 * /sell/chat — the WhatsApp listing assistant in the browser. Visitors first
 * confirm their mobile number with a code; sellers who are signed in go
 * straight to their thread (with every notification we've sent them).
 */
export function SellerChat({ initial, autoStart, upgrade }: { initial: ChatState | null; autoStart: boolean; upgrade: boolean }) {
  const [state, setState] = useState<ChatState | null>(initial);
  const [fresh, setFresh] = useState(false);

  if (!state) {
    return (
      <VerifyNumber
        onVerified={(next) => {
          setFresh(true);
          setState(next);
        }}
      />
    );
  }
  return (
    <ChatThread
      key={state.phone}
      initial={state}
      autoStart={autoStart}
      upgrade={upgrade && !fresh}
      onSignedOut={() => setState(null)}
    />
  );
}

// ───────────────────────────── The chat ─────────────────────────────

function ChatThread({
  initial,
  autoStart,
  upgrade,
  onSignedOut,
}: {
  initial: ChatState;
  autoStart: boolean;
  upgrade: boolean;
  onSignedOut: () => void;
}) {
  const chat = useWhatsAppChat({
    initial,
    send: async (form) => {
      const result = await chatSend(form);
      if (result.needsVerification) {
        onSignedOut();
        return null;
      }
      return result.state;
    },
  });
  const started = useRef(false);
  const { startTransition, apply, sendText } = chat;

  // A number that has become a seller since its code was checked: swap in a seller session.
  useEffect(() => {
    if (!upgrade) return;
    startTransition(async () => {
      const result = await chatLoad();
      if (!result.needsVerification) apply(result.state);
    });
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // /sell/chat?start=1 from the "List on WhatsApp" buttons: begin the listing straight away.
  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    window.history.replaceState(null, "", "/sell/chat");
    if (initial.messages.length === 0) sendText("SELL");
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ChatWindow
      chat={chat}
      variant="seller"
      backHref="/sell"
      suggestions={sellerSuggestions(chat.state)}
      notice="This is the official InstaPlots chat. Our listing assistant replies instantly — send TALK anytime to reach a person from our team."
      emptyState={
        <div className="mx-auto mt-6 flex max-w-xs flex-col items-center gap-3 rounded-2xl bg-white px-6 py-6 text-center shadow-sm">
          <span className="grid size-14 place-items-center rounded-2xl bg-brand-50">
            <LogoMark className="size-10" />
          </span>
          <p className="text-[16px] font-bold text-ink">List your land in 2 minutes</p>
          <p className="text-[14px] leading-snug text-muted">
            Answer a few quick questions, add photos, and buyers contact you directly. Free, no documents needed.
          </p>
          <button
            type="button"
            onClick={() => chat.sendText("SELL")}
            disabled={chat.isPending}
            className="mt-1 inline-flex h-11 items-center gap-2 rounded-full bg-brand-600 px-6 text-[15px] font-semibold text-white shadow-brand transition hover:bg-brand-700 active:scale-95 disabled:opacity-60"
          >
            Send “SELL” <ArrowRight className="size-4" aria-hidden />
          </button>
        </div>
      }
    />
  );
}

// ───────────────────────────── Verify the number ─────────────────────────────

function VerifyNumber({ onVerified }: { onVerified: (state: ChatState) => void }) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [shownCode, setShownCode] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const id = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(id);
  }, [wait]);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await chatStartVerification({ phone });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMaskedPhone(result.maskedPhone.replace(/ /g, "\u00a0"));
      setShownCode(result.code ?? null);
      setWait(result.retryAfterSeconds ?? 45);
      setCode("");
      setStep("code");
      window.setTimeout(() => codeRef.current?.focus(), 50);
    } catch {
      setError("Couldn't send the code. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(value: string) {
    if (busy || !/^\d{6}$/.test(value)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await chatVerify({ phone, code: value });
      if (!result.ok) {
        setError(result.message);
        if (result.clear) setCode("");
        return;
      }
      onVerified(result.state);
    } catch {
      setError("Couldn't check the code. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function onCodeChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6) void verify(digits);
  }

  return (
    <ChatFrame variant="seller" subtitle="Listing assistant · replies instantly" backHref="/sell">
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3" style={CHAT_WALLPAPER}>
        <span className="mx-auto mb-3 block w-fit rounded-lg bg-white/90 px-3 py-1 text-[12px] font-medium text-[#54656f] shadow-sm">Today</span>
        <div className="max-w-[86%] rounded-xl rounded-tl-none bg-white px-3 md:max-w-[34rem] pt-1.5 pb-2 text-[15px] leading-snug text-[#111b21] shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]">
          <WaRichText
            text={
              step === "phone"
                ? "Namaste 🙏 Welcome to *InstaPlots*.\n\nList your land in about 2 minutes, right here in this chat. First, let's confirm your mobile number."
                : `We've sent a 6-digit code to ${maskedPhone}. Enter it below to start chatting.`
            }
          />
        </div>

        {step === "phone" ? (
          <form onSubmit={sendCode} className="mx-auto mt-4 w-full max-w-sm animate-fade-in rounded-2xl bg-white p-5 shadow-sm">
            <label htmlFor="chat-phone" className="text-[15px] font-semibold text-ink">
              Enter your mobile number
            </label>
            <div className="mt-2 flex h-12 items-center overflow-hidden rounded-xl border border-line-strong bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
              <span className="flex h-full items-center border-r border-line bg-mist px-3 text-[15px] font-semibold text-ink-soft">+91</span>
              <input
                id="chat-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d\s+]/g, "").slice(0, 15))}
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="98765 43210"
                className="h-full min-w-0 flex-1 bg-transparent px-3 text-base tracking-wide text-ink placeholder:text-faint focus:outline-none"
                autoFocus
              />
            </div>
            <p className="mt-2 text-[13px] text-muted">We&apos;ll send a code to confirm it&apos;s you. This number is how buyers reach you.</p>
            {error && (
              <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || phone.replace(/\D/g, "").length < 10}
              className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-600 text-[15px] font-semibold text-white shadow-brand transition hover:bg-brand-700 active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : null}
              Continue
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void verify(code);
            }}
            className="mx-auto mt-4 w-full max-w-sm animate-fade-in rounded-2xl bg-white p-5 shadow-sm"
          >
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="chat-code" className="text-[15px] font-semibold text-ink">
                Enter the 6-digit code
              </label>
              <button
                type="button"
                onClick={() => {
                  setStep("phone");
                  setError(null);
                  setShownCode(null);
                }}
                className="shrink-0 text-[13px] font-semibold text-brand-700 hover:underline"
              >
                Change number
              </button>
            </div>
            <input
              id="chat-code"
              ref={codeRef}
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="••••••"
              maxLength={6}
              className="mt-2 h-12 w-full rounded-xl border border-line-strong bg-white px-3 text-center text-xl font-semibold tracking-[0.5em] text-ink tabular placeholder:text-faint focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
            />
            {shownCode && (
              <button
                type="button"
                onClick={() => onCodeChange(shownCode)}
                className="mt-3 w-full rounded-xl bg-brand-50 px-3 py-2.5 text-center text-[14px] text-brand-800 ring-1 ring-brand-100 transition hover:bg-brand-100"
              >
                Your code: <b className="tracking-wider tabular">{shownCode}</b> (tap to fill)
              </button>
            )}
            {error && (
              <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-600 text-[15px] font-semibold text-white shadow-brand transition hover:bg-brand-700 active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : null}
              Verify &amp; start chatting
            </button>
            <p className="mt-3 text-center text-[13px] text-muted">
              {wait > 0 ? (
                <>Didn&apos;t get it? You can ask for a new code in {wait}s</>
              ) : (
                <button type="button" onClick={() => void sendCode()} disabled={busy} className="font-semibold text-brand-700 hover:underline disabled:opacity-60">
                  Send a new code
                </button>
              )}
            </p>
          </form>
        )}
      </div>
    </ChatFrame>
  );
}
