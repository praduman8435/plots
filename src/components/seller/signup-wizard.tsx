"use client";

import { AlertTriangle, ArrowLeft, ArrowRight, Terminal } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { WhatsAppIcon } from "@/components/ui/icons";
import { startSignup, verifySignup } from "@/server/actions/seller/signup";

type Step = "name" | "phone" | "otp";
const KEY = "plots.signup";

/** Name → mobile → OTP, one question per screen. Survives a refresh (sessionStorage). */
export function SignupWizard() {
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ maskedPhone: string; existingName?: string } | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Restore after an accidental refresh (storage is only readable after mount).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { name?: string; phone?: string } | null;
      if (saved?.name) {
        setName(saved.name);
        if (saved.phone) setPhone(saved.phone);
        setStep("phone");
      }
    } catch {}
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ name, phone }));
    } catch {}
  }, [name, phone]);
  useEffect(() => inputRef.current?.focus(), [step]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  function sendCode() {
    setError(null);
    start(async () => {
      const r = await startSignup({ name, phone });
      if (!r.ok) {
        setError(r.message);
        if (r.field === "name") setStep("name");
        return;
      }
      setSent({ maskedPhone: r.maskedPhone, existingName: r.existingName });
      setDevCode(r.devCode ?? null);
      setCooldown(r.retryAfterSeconds ?? 45);
      setCode("");
      setStep("otp");
    });
  }

  function verify(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6 || pending) return;
    setError(null);
    start(async () => {
      const r = await verifySignup({ name, phone, code });
      if (r && !r.ok) {
        setError(r.message);
        if (r.clear) setCode("");
        return;
      }
      try {
        sessionStorage.removeItem(KEY);
      } catch {}
    });
  }

  const errorBox = error && (
    <p role="alert" className="mt-4 flex items-start gap-2 rounded-2xl bg-red-50 p-3.5 text-sm text-red-800 ring-1 ring-red-100">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
    </p>
  );

  if (step === "name") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim().length < 2) return setError("Please enter your name");
          setError(null);
          setStep("phone");
        }}
      >
        <Question title="What should we call you?" hint="Buyers will see this name on your listings." />
        <label htmlFor="name" className="sr-only">Your name</label>
        <Input ref={inputRef} id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ramesh Yadav" className="h-14 text-lg" />
        {errorBox}
        <Button type="submit" size="xl" className="mt-6 w-full">
          Continue <ArrowRight />
        </Button>
      </form>
    );
  }

  if (step === "phone") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!pending) sendCode();
        }}
      >
        <BackButton onClick={() => setStep("name")} />
        <Question title={`Your mobile number, ${name.split(" ")[0]}?`} hint="We'll send a 6-digit code on WhatsApp. Buyers will contact you on this number." />
        <label htmlFor="phone" className="sr-only">Mobile number</label>
        <div className="flex">
          <span className="flex h-14 items-center rounded-l-xl border border-r-0 border-line-strong bg-mist px-4 text-lg font-medium text-ink-soft">+91</span>
          <Input
            ref={inputRef}
            id="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/[^\d ]/g, "").slice(0, 11))}
            placeholder="98765 43210"
            className="h-14 rounded-l-none text-lg tracking-wide"
          />
        </div>
        {errorBox}
        <Button type="submit" size="xl" className="mt-6 w-full" disabled={pending}>
          {pending ? "Sending code…" : <>Send code <WhatsAppIcon /></>}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={verify}>
      <BackButton onClick={() => setStep("phone")} label="Change number" />
      <Question
        title="Enter the code"
        hint={
          sent?.existingName
            ? `Welcome back, ${sent.existingName.split(" ")[0]}! You already have a seller account — we sent a code to ${sent.maskedPhone}.`
            : `We sent a 6-digit code to your WhatsApp ${sent?.maskedPhone ?? ""}.`
        }
      />
      {devCode && (
        <p className="mb-4 flex items-center gap-2.5 rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-3.5 text-sm text-amber-900">
          <Terminal className="size-5 shrink-0" aria-hidden />
          <span>
            <strong>Demo:</strong> WhatsApp isn&apos;t connected yet. Your code is{" "}
            <button type="button" className="font-mono text-base font-bold underline decoration-dotted" onClick={() => setCode(devCode)}>
              {devCode}
            </button>
          </span>
        </p>
      )}
      <label htmlFor="otp" className="sr-only">6-digit code</label>
      <Input
        ref={inputRef}
        id="otp"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="••••••"
        className="h-16 text-center font-mono text-3xl font-bold tracking-[0.5em]"
      />
      {errorBox}
      <Button type="submit" size="xl" className="mt-6 w-full" disabled={pending || code.length !== 6}>
        {pending ? "Checking…" : "Verify"}
      </Button>
      <button
        type="button"
        disabled={cooldown > 0 || pending}
        onClick={sendCode}
        className="tabular mt-3 w-full py-2 text-sm font-semibold text-muted hover:text-ink disabled:opacity-60"
      >
        {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
      </button>
    </form>
  );
}

function Question({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-[1.6rem] leading-tight font-extrabold text-ink sm:text-3xl">{title}</h1>
      {hint && <p className="mt-2 text-[15px] text-muted">{hint}</p>}
    </div>
  );
}

function BackButton({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-muted hover:text-ink">
      <ArrowLeft className="size-4" aria-hidden /> {label}
    </button>
  );
}
