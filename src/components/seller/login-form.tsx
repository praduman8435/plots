"use client";

import { AlertTriangle, ArrowLeft, ArrowRight, IdCard, Terminal } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Button, ButtonA } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { WhatsAppIcon } from "@/components/ui/icons";
import { sellOnWhatsAppProps } from "@/lib/whatsapp-links";
import { requestSellerCode, signInWithoutCode, verifySellerCode } from "@/server/actions/seller/auth";

const DEFAULT_COOLDOWN = 45;

/** Seller ID (or mobile) → 6-digit code on WhatsApp → signed in. Same flow as the shop project's portal. */
export function SellerLoginForm({ otpPaused, next }: { otpPaused: boolean; next?: string }) {
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<"id" | "code">("id");
  const [identifier, setIdentifier] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<{ message: string; notFound?: boolean } | null>(null);
  const [sentTo, setSentTo] = useState<{ maskedPhone: string; firstName?: string } | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const idId = useId();
  const codeId = useId();
  const phoneId = useId();
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  function sendCode() {
    setError(null);
    startTransition(async () => {
      const r = await requestSellerCode({ identifier });
      if (r.ok) {
        setSentTo({ maskedPhone: r.maskedPhone, firstName: r.firstName });
        setDevCode(r.devCode ?? null);
        setStep("code");
        setCode("");
        setCooldown(DEFAULT_COOLDOWN);
        return;
      }
      setError({ message: r.message, notFound: r.reason === "NOT_FOUND" });
      if (r.reason === "COOLDOWN") {
        setSentTo({ maskedPhone: r.maskedPhone ?? "your WhatsApp" });
        setStep("code");
        setCooldown(r.retryAfterSeconds ?? DEFAULT_COOLDOWN);
      }
    });
  }

  function submitId(e: React.FormEvent) {
    e.preventDefault();
    if (pending || !identifier.trim()) return;
    if (otpPaused) {
      setError(null);
      startTransition(async () => {
        const r = await signInWithoutCode({ sellerId: identifier, phone });
        if (r && !r.ok) setError({ message: r.message });
      });
      return;
    }
    sendCode();
  }

  function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (pending || code.length !== 6) return;
    setError(null);
    startTransition(async () => {
      const r = await verifySellerCode({ identifier, code, next });
      if (r && !r.ok) {
        setError({ message: r.message });
        if (r.clear) setCode("");
      }
    });
  }

  const errorBox = error && (
    <div role="alert" className="flex items-start gap-2.5 rounded-2xl bg-red-50 p-3.5 text-sm text-red-800 ring-1 ring-red-100">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>
        <p>{error.message}</p>
        {error.notFound && (
          <a {...sellOnWhatsAppProps()} className="mt-1.5 inline-flex items-center gap-1 font-semibold text-brand-700">
            <WhatsAppIcon className="size-3.5" /> List on WhatsApp
          </a>
        )}
      </div>
    </div>
  );

  if (step === "id") {
    return (
      <form onSubmit={submitId} className="space-y-4" noValidate>
        {errorBox}
        <Field label={otpPaused ? "Seller ID" : "Seller ID or mobile number"} htmlFor={idId}>
          <div className="relative">
            <IdCard className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-brand-600" aria-hidden />
            <Input
              id={idId}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={otpPaused ? "SLR-7A41K2" : "SLR-7A41K2 or 98765 43210"}
              autoComplete="username"
              autoCapitalize="characters"
              spellCheck={false}
              className="h-14 pl-12 font-semibold tracking-wide"
              aria-invalid={Boolean(error)}
            />
          </div>
        </Field>
        {otpPaused && (
          <Field label="Registered mobile number" htmlFor={phoneId}>
            <Input id={phoneId} type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" className="h-14" />
          </Field>
        )}
        <Button type="submit" size="xl" className="w-full" disabled={pending}>
          {pending ? (otpPaused ? "Signing in…" : "Sending code…") : otpPaused ? "Sign in" : "Send code on WhatsApp"}
          {!pending && <ArrowRight />}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={submitCode} className="space-y-4" noValidate>
      <button
        type="button"
        onClick={() => {
          setStep("id");
          setError(null);
          setDevCode(null);
        }}
        className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden /> Change Seller ID
      </button>

      {sentTo && !error && (
        <div className="flex items-center gap-3 rounded-2xl bg-brand-50 p-3.5 text-sm text-brand-900 ring-1 ring-brand-100">
          <WhatsAppIcon className="size-5 shrink-0 text-brand-600" />
          <p>
            {sentTo.firstName ? `Namaste ${sentTo.firstName}! ` : ""}We sent a 6-digit code to your WhatsApp <strong className="tabular">{sentTo.maskedPhone}</strong>.
          </p>
        </div>
      )}
      {devCode && (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-3.5 text-sm text-amber-900">
          <Terminal className="size-5 shrink-0" aria-hidden />
          <p>
            Your code is{" "}
            <button type="button" onClick={() => setCode(devCode)} className="tabular font-mono text-base font-bold underline decoration-dotted">
              {devCode}
            </button>
          </p>
        </div>
      )}
      {errorBox}

      <Field label="6-digit code" htmlFor={codeId}>
        <Input
          ref={codeRef}
          id={codeId}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="••••••"
          className="h-16 text-center font-mono text-3xl font-bold tracking-[0.5em]"
          aria-invalid={Boolean(error)}
        />
      </Field>
      <Button type="submit" size="xl" className="w-full" disabled={pending || code.length !== 6}>
        {pending ? "Verifying…" : "Verify & sign in"}
      </Button>
      <button
        type="button"
        onClick={() => cooldown === 0 && !pending && sendCode()}
        disabled={cooldown > 0 || pending}
        className="tabular w-full py-2 text-sm font-semibold text-muted hover:text-ink disabled:opacity-60"
      >
        {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
      </button>
    </form>
  );
}

export function NoSellerIdHelp() {
  return (
    <div className="rounded-3xl bg-mist p-5 text-center ring-1 ring-line">
      <p className="font-semibold text-ink">Don&apos;t have a Seller ID yet?</p>
      <p className="mt-1 text-sm text-muted">You get one automatically when you list your first plot.</p>
      <ButtonA {...sellOnWhatsAppProps()} variant="secondary" className="mt-4">
        <WhatsAppIcon className="text-brand-600" /> List on WhatsApp
      </ButtonA>
    </div>
  );
}
